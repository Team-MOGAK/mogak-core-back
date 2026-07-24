# Instance-Local Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relax the local Nest rate-limit policies and record only local limiter rejections without introducing distributed rate limiting infrastructure.

**Architecture:** Existing controller metadata continues to choose the policy and `RateLimitGuard` continues to perform the in-memory decision. On rejection, the guard emits one Nest `warn` object with static handler and policy metadata before throwing the existing `Z007` exception; it never logs client data or credentials.

**Tech Stack:** NestJS 11, TypeScript, Jest, Supertest, ESLint, Prettier.

---

## File structure

- Modify: `src/auth/presentation/auth.controller.ts` — set local policies to login 20/min and refresh 60/min.
- Modify: `src/users/presentation/user.controller.ts` — set nickname verification to 60/min.
- Modify: `src/auth/presentation/auth.controller.spec.ts` — exercise the revised Apple, generic provider, and refresh thresholds through HTTP.
- Modify: `src/users/presentation/users.controller.spec.ts` — exercise the revised nickname threshold through HTTP.
- Create: `src/common/http/rate-limit.guard.spec.ts` — test rejection-only warn logging with the real guard.
- Modify: `src/common/http/rate-limit.guard.ts` — emit the safe rejection log immediately before the existing exception.
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md` — document 20/60/60 policies, rejection log content, and multi-instance limitation.

### Task 1: Revise endpoint limits through HTTP contracts

**Files:**
- Modify: `src/auth/presentation/auth.controller.spec.ts:90-136`
- Modify: `src/users/presentation/users.controller.spec.ts:91-109`
- Modify: `src/auth/presentation/auth.controller.ts:35-58`
- Modify: `src/users/presentation/user.controller.ts:56-62`

- [x] **Step 1: Write failing HTTP contract tests for the new thresholds**

Replace the current 10-attempt auth test with this test body. It proves the two login handlers have independent buckets and that refresh has a higher threshold.

```ts
it('같은 IP의 로그인은 분당 스무 번째, 토큰 갱신은 예순 번째까지만 서비스에 전달한다', async () => {
  authService.login.mockResolvedValue({
    isRegistered: false,
    userId: 7,
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
  });
  authService.refresh.mockResolvedValue({ accessToken: 'next-access', refreshToken: 'next-refresh' });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await request(app.getHttpServer()).post('/api/auth/login').send({ id_token: 'apple-id-token' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/google/login').send({ token: 'google-id-token' }).expect(200);
  }
  await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ id_token: 'apple-id-token' })
    .expect(429)
    .expect(({ body }) => expect(body.code).toBe('Z007'));
  await request(app.getHttpServer())
    .post('/api/auth/google/login')
    .send({ token: 'google-id-token' })
    .expect(429)
    .expect(({ body }) => expect(body.code).toBe('Z007'));

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await request(app.getHttpServer()).post('/api/auth/refresh').set('RefreshToken', 'current-refresh').expect(201);
  }
  await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .set('RefreshToken', 'current-refresh')
    .expect(429)
    .expect(({ body }) => expect(body.code).toBe('Z007'));

  expect(authService.login).toHaveBeenCalledTimes(40);
  expect(authService.refresh).toHaveBeenCalledTimes(60);
});
```

Change the nickname test loop and expectation from `30` to `60`, and update its Korean test name to `분당 예순 번째까지만`.

- [x] **Step 2: Run the changed HTTP contracts and verify RED**

Run:

```bash
pnpm test --runInBand src/auth/presentation/auth.controller.spec.ts src/users/presentation/users.controller.spec.ts
```

Expected: FAIL because the existing decorators still reject login after 10 calls, refresh after 10 calls, and nickname verification after 30 calls.

- [x] **Step 3: Apply the minimum policy changes**

In `src/auth/presentation/auth.controller.ts`, change all three decorators to the following exact values:

```ts
@RateLimit({ limit: 20, windowMs: 60_000 }) // POST /api/auth/login
@RateLimit({ limit: 20, windowMs: 60_000 }) // POST /api/auth/:provider/login
@RateLimit({ limit: 60, windowMs: 60_000 }) // POST /api/auth/refresh
```

In `src/users/presentation/user.controller.ts`, change nickname verification to:

```ts
@RateLimit({ limit: 60, windowMs: 60_000 })
```

Do not alter key construction, bucket expiry, HTTP response shape, or add configuration variables.

- [x] **Step 4: Run the HTTP contracts and verify GREEN**

Run:

```bash
pnpm test --runInBand src/auth/presentation/auth.controller.spec.ts src/users/presentation/users.controller.spec.ts
```

Expected: PASS, with both rejected requests returning the existing `429 Z007` contract.

- [x] **Step 5: Commit the policy change**

```bash
git add src/auth/presentation/auth.controller.ts src/auth/presentation/auth.controller.spec.ts src/users/presentation/user.controller.ts src/users/presentation/users.controller.spec.ts
git commit -m "feat(rate-limit): relax local request limits"
```

### Task 2: Emit safe logs for local limiter rejections

**Files:**
- Create: `src/common/http/rate-limit.guard.spec.ts`
- Modify: `src/common/http/rate-limit.guard.ts:1-39`

- [x] **Step 1: Write a failing guard test**

Create `src/common/http/rate-limit.guard.spec.ts` with the following tests. The first test fixes the exact public log payload and verifies no IP or credential enters it; the second proves allowed requests are silent.

```ts
import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

import { AppErrorCode } from './app-error-code';
import { AppException } from './app.exception';
import { RateLimitGuard } from './rate-limit.guard';

const policy = { limit: 20, windowMs: 60_000 };
const handler = Object.defineProperty(() => undefined, 'name', { value: 'loginApple' });
const context = {
  getHandler: () => handler,
  getClass: () => class AuthController {},
  switchToHttp: () => ({
    getRequest: () => ({
      ip: '203.0.113.10',
      headers: { authorization: 'Bearer secret', refreshtoken: 'refresh-secret' },
      body: { id_token: 'social-secret' },
    }),
  }),
};

describe('RateLimitGuard 거절 로그', () => {
  afterEach(() => jest.restoreAllMocks());

  it('거절한 요청의 handler와 정책만 warn 로그로 남긴다', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new RateLimitGuard(
      { getAllAndOverride: () => policy } as never,
      { consume: () => false } as never,
    );

    expect(() => guard.canActivate(context as never)).toThrow(
      new AppException(AppErrorCode.TOO_MANY_REQUESTS),
    );
    expect(warn).toHaveBeenCalledWith({
      event: 'rate_limit_rejected',
      handler: 'loginApple',
      limit: 20,
      windowMs: 60_000,
    });
  });

  it('허용한 요청에는 warn 로그를 남기지 않는다', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new RateLimitGuard(
      { getAllAndOverride: () => policy } as never,
      { consume: () => true } as never,
    );

    expect(guard.canActivate(context as never)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the guard test and verify RED**

Run:

```bash
pnpm test --runInBand src/common/http/rate-limit.guard.spec.ts
```

Expected: FAIL because `RateLimitGuard` does not call `Logger.warn`.

- [x] **Step 3: Add the minimum rejection log**

Add `Logger` to the existing `@nestjs/common` import and add this field to `RateLimitGuard`:

```ts
private readonly logger = new Logger(RateLimitGuard.name);
```

Store the handler name once before constructing the key. Replace the denial branch with:

```ts
const handler = context.getHandler().name;
const key = `${handler}:${request.ip ?? 'unknown'}`;
if (!this.limiter.consume(key, policy)) {
  this.logger.warn({
    event: 'rate_limit_rejected',
    handler,
    limit: policy.limit,
    windowMs: policy.windowMs,
  });
  throw new AppException(AppErrorCode.TOO_MANY_REQUESTS);
}
```

Do not pass `request`, headers, IP, token, body, query, or exception object to the logger.

- [x] **Step 4: Run guard and existing limiter tests to verify GREEN**

Run:

```bash
pnpm test --runInBand src/common/http/rate-limit.guard.spec.ts src/common/http/fixed-window-rate-limiter.spec.ts src/common/http/fixed-window-rate-limiter.commonjs.spec.ts
```

Expected: PASS. The rejection test sees exactly one safe object and the allowed-request test sees no warn call.

- [x] **Step 5: Commit the rejection log**

```bash
git add src/common/http/rate-limit.guard.ts src/common/http/rate-limit.guard.spec.ts
git commit -m "feat(rate-limit): log local request rejections"
```

### Task 3: Update the handoff record and run the complete local gate

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md:744-753`
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md:900-907`

- [x] **Step 1: Update the handoff documentation**

Replace the old 10/10/10 and 30/min policy statements with the exact 20/20/60 and 60/min values. Add that the Nest limiter emits `rate_limit_rejected` only when it rejects, including only handler, limit, and window values; it does not log IP, tokens, headers, body, or query. Retain the explicit statement that Cloud Run instances do not share buckets and that global limiting is deferred until a separately designed Redis implementation is needed.

- [x] **Step 2: Check formatting and the complete local gate**

Run:

```bash
pnpm format:check
pnpm verify:local
```

Expected: both commands exit 0. `verify:local` additionally confirms the built API scenario still succeeds against `mogak_test`.

- [x] **Step 3: Commit documentation**

```bash
git add docs/migration/2026-07-23-nestjs-migration-handoff.md
git commit -m "docs: clarify local rate limit behavior"
```
