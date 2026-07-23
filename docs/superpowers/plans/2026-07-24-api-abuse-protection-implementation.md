# API Abuse Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing mobile API while rejecting oversized, excessive, or non-image multipart uploads and rate-limiting public authentication and nickname-verification requests.

**Architecture:** Keep upload policy in one common Multer-options module so both controllers apply the same 5 MiB image rule; the Posts route additionally caps its field at five files. Add an injectable bounded fixed-window limiter and a metadata-driven guard, then apply it only to the three public attack surfaces. All failures use the existing `AppException`/BaseResponse envelope, with a new explicit `429` error definition.

**Tech Stack:** NestJS 11, Express/Multer, Jest 30, Supertest, TypeScript.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/common/http/image-upload.options.ts` | Defines the fixed image MIME allowlist, 5 MiB limit, post-file count, and reusable Multer options. |
| `src/common/http/image-upload.options.spec.ts` | Verifies boundary constants and rejection of non-image MIME values. |
| `src/common/http/fixed-window-rate-limiter.ts` | Holds bounded, expiring per-key counters without HTTP knowledge. |
| `src/common/http/fixed-window-rate-limiter.spec.ts` | Verifies window reset, rejection at the limit, and bounded bucket eviction. |
| `src/common/http/rate-limit.decorator.ts` | Stores a complete route policy as Nest metadata. |
| `src/common/http/rate-limit.guard.ts` | Reads policy, uses request IP, and throws the standard `429` app error. |
| `src/common/http/app-error-code.ts` | Adds the public `TOO_MANY_REQUESTS` definition. |
| `src/modules/auth/presentation/auth.controller.ts` | Applies 10/minute guard policy to Apple login, social login, and refresh. |
| `src/modules/users/presentation/user.controller.ts` | Applies 30/minute IP policy to public nickname verification and profile upload options. |
| `src/modules/posts/presentation/posts.controller.ts` | Applies post upload options and the five-file field cap. |
| `src/modules/auth/presentation/auth.controller.spec.ts` | Verifies auth routes return `429` after ten requests. |
| `src/modules/users/presentation/users.controller.spec.ts` | Verifies nickname throttling and rejected profile uploads. |
| `src/modules/posts/presentation/posts.controller.spec.ts` | Verifies rejected post upload count, size, and MIME are never delegated to services. |

### Task 1: Write upload-boundary contract tests

**Files:**
- Modify: `src/modules/posts/presentation/posts.controller.spec.ts`
- Modify: `src/modules/users/presentation/users.controller.spec.ts`

- [ ] **Step 1: Add the posts failing tests**

  Add one Korean scenario which attaches six `image/png` files and another which attaches a `5 * 1024 * 1024 + 1` byte `image/png` file. Both requests use the existing `request` multipart JSON field and assert `400`; both assert `storage.uploadPostImages` and `posts.createPost` were not called.

  ```ts
  it('게시글은 다섯 장을 초과하거나 5 MiB를 넘는 이미지를 서비스에 전달하지 않는다', async () => {
    const image = Buffer.from('image');
    let oversized = request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }));
    for (let index = 0; index < 6; index += 1) {
      oversized = oversized.attach('multipartFile', image, {
        filename: `post-${index}.png`, contentType: 'image/png',
      });
    }
    await oversized.expect(400);
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.png', contentType: 'image/png',
      })
      .expect(400);
    expect(storage.uploadPostImages).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 2: Add the MIME rejection test**

  Add a separate posts test for `text/plain`. It must assert HTTP `400` and no Storage call.

  ```ts
  await request(app.getHttpServer())
    .post('/api/jogaks/11/posts')
    .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
    .attach('multipartFile', Buffer.from('not an image'), {
      filename: 'payload.txt', contentType: 'text/plain',
    })
    .expect(400);
  expect(storage.uploadPostImages).not.toHaveBeenCalled();
  ```

- [ ] **Step 3: Add the profile upload failing test**

  Extend the `users` mock with `updateProfileImage`. Send a `text/plain` profile file and a 5 MiB-plus `image/png` profile file. Both must return `400` without calling `users.updateProfileImage`.

  ```ts
  const users = { /* existing mocks */, updateProfileImage: testMock() };
  await request(app.getHttpServer())
    .put('/api/users/profile/image')
    .attach('multipartFile', Buffer.from('not an image'), {
      filename: 'profile.txt', contentType: 'text/plain',
    })
    .expect(400);
  expect(users.updateProfileImage).not.toHaveBeenCalled();
  ```

- [ ] **Step 4: Run the focused upload tests and confirm RED**

  Run: `pnpm test src/modules/posts/presentation/posts.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts --runInBand`

  Expected: the added tests fail because the existing interceptors accept all MIME values, have no 5 MiB limit, and Posts accepts more than five files.

### Task 2: Implement reusable Multer upload protection

**Files:**
- Create: `src/common/http/image-upload.options.ts`
- Create: `src/common/http/image-upload.options.spec.ts`
- Modify: `src/modules/posts/presentation/posts.controller.ts`
- Modify: `src/modules/users/presentation/user.controller.ts`

- [ ] **Step 1: Implement the reusable policy**

  Export the following values and options. Reject disallowed MIME using the existing `AppException(AppErrorCode.INVALID_PARAMETER)` so the global filter retains the BaseResponse body.

  ```ts
  import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
  import { AppErrorCode } from './app-error-code';
  import { AppException } from './app.exception';

  export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  export const MAX_POST_IMAGE_COUNT = 5;
  const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

  const allowImage: NonNullable<MulterOptions['fileFilter']> = (_request, file, callback) => {
    if (!imageMimeTypes.has(file.mimetype)) {
      callback(new AppException(AppErrorCode.INVALID_PARAMETER));
      return;
    }
    callback(null, true);
  };

  export const profileImageUploadOptions: MulterOptions = {
    limits: { fileSize: MAX_IMAGE_FILE_SIZE_BYTES }, fileFilter: allowImage,
  };
  export const postImageUploadOptions: MulterOptions = {
    limits: { fileSize: MAX_IMAGE_FILE_SIZE_BYTES, files: MAX_POST_IMAGE_COUNT }, fileFilter: allowImage,
  };
  ```

- [ ] **Step 2: Wire the policy without changing API fields or routes**

  Replace the existing interceptors with the policy imports:

  ```ts
  @UseInterceptors(
    FilesInterceptor('multipartFile', MAX_POST_IMAGE_COUNT, postImageUploadOptions),
  )
  // and
  @UseInterceptors(FileInterceptor('multipartFile', profileImageUploadOptions))
  ```

  Do not add a Storage implementation, alter `multipartFile`, or reject zero-byte files.

- [ ] **Step 3: Add focused policy unit tests**

  Test that `MAX_IMAGE_FILE_SIZE_BYTES` is `5 * 1024 * 1024`, Posts has `files: 5`, and the callback accepts `image/jpeg`, `image/png`, `image/webp` but rejects `text/plain` with `Z005`.

- [ ] **Step 4: Run the focused upload tests and confirm GREEN**

  Run: `pnpm test src/common/http/image-upload.options.spec.ts src/modules/posts/presentation/posts.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts --runInBand`

  Expected: PASS. Existing empty-file and `Z006` Storage-disabled contract tests remain green.

- [ ] **Step 5: Commit the upload boundary**

  ```bash
  git add src/common/http/image-upload.options.ts src/common/http/image-upload.options.spec.ts src/modules/posts/presentation/posts.controller.ts src/modules/posts/presentation/posts.controller.spec.ts src/modules/users/presentation/user.controller.ts src/modules/users/presentation/users.controller.spec.ts
  git commit -m "fix(api): limit multipart uploads"
  ```

### Task 3: Write rate-limit contract and core tests

**Files:**
- Create: `src/common/http/fixed-window-rate-limiter.spec.ts`
- Modify: `src/modules/auth/presentation/auth.controller.spec.ts`
- Modify: `src/modules/users/presentation/users.controller.spec.ts`

- [ ] **Step 1: Add the fixed-window limiter failing test**

  Test a limiter whose `consume` is called with the same key, `limit: 2`, `windowMs: 60_000`, and controlled times. The first two calls must be true, third false, and a call after the expiry true. Also fill a limiter past its exported maximum bucket count and assert its bucket count never exceeds that maximum.

  ```ts
  expect(limiter.consume('ip', { limit: 2, windowMs: 60_000 }, 0)).toBe(true);
  expect(limiter.consume('ip', { limit: 2, windowMs: 60_000 }, 1)).toBe(true);
  expect(limiter.consume('ip', { limit: 2, windowMs: 60_000 }, 2)).toBe(false);
  expect(limiter.consume('ip', { limit: 2, windowMs: 60_000 }, 60_000)).toBe(true);
  ```

- [ ] **Step 2: Add HTTP failing tests**

  Register the future guard and limiter in the auth/users testing modules. Call Apple login ten times, then assert the eleventh response is `429` with `Z007`; repeat for refresh and nickname verification. Assert the service mock is called only ten times for each route.

  ```ts
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await request(app.getHttpServer()).post('/api/auth/login').send({ id_token: 'apple-id-token' }).expect(200);
  }
  await request(app.getHttpServer())
    .post('/api/auth/login').send({ id_token: 'apple-id-token' })
    .expect(429)
    .expect(({ body }) => expect(body.code).toBe('Z007'));
  expect(authService.login).toHaveBeenCalledTimes(10);
  ```

- [ ] **Step 3: Run the focused rate-limit tests and confirm RED**

  Run: `pnpm test src/common/http/fixed-window-rate-limiter.spec.ts src/modules/auth/presentation/auth.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts --runInBand`

  Expected: FAIL because the limiter, guard, error definition, and route metadata do not exist.

### Task 4: Implement the bounded fixed-window guard

**Files:**
- Create: `src/common/http/fixed-window-rate-limiter.ts`
- Create: `src/common/http/rate-limit.decorator.ts`
- Create: `src/common/http/rate-limit.guard.ts`
- Modify: `src/common/http/app-error-code.ts`
- Modify: `src/modules/auth/auth.module.ts`
- Modify: `src/modules/users/users.module.ts`
- Modify: `src/modules/auth/presentation/auth.controller.ts`
- Modify: `src/modules/users/presentation/user.controller.ts`

- [ ] **Step 1: Add the standard rate-limit error**

  Add one app error, preserving the existing code style:

  ```ts
  TOO_MANY_REQUESTS: {
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    code: 'Z007',
    message: '요청이 너무 많습니다',
  },
  ```

- [ ] **Step 2: Implement the pure bounded limiter**

  Define `RateLimitPolicy = Readonly<{ limit: number; windowMs: number }>` and an exported `MAX_RATE_LIMIT_BUCKETS = 10_000`. `consume(key, policy, now = Date.now())` counts accepted requests inclusively, returns `false` at the limit, and checks/removes expired buckets only when the bounded map reaches capacity; if still full, it removes the oldest Map key. This avoids scanning all buckets on every new IP while keeping memory bounded. Make the class injectable for module registration.

  ```ts
  if (bucket !== undefined && bucket.expiresAt > now) {
    if (bucket.count >= policy.limit) return false;
    bucket.count += 1;
    return true;
  }
  if (this.buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    this.removeExpired(now);
    if (this.buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey !== undefined) this.buckets.delete(oldestKey);
    }
  }
  this.buckets.set(key, { count: 1, expiresAt: now + policy.windowMs });
  return true;
  ```

- [ ] **Step 3: Implement policy metadata and guard**

  `RateLimit(policy)` sets a symbol metadata value. The injectable guard reads handler/class metadata with `Reflector`, bypasses an unannotated route, and keys buckets by `${context.getHandler().name}:${request.ip ?? 'unknown'}`. When `consume` returns false, throw `new AppException(AppErrorCode.TOO_MANY_REQUESTS)`.

  ```ts
  const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_POLICY, [
    context.getHandler(), context.getClass(),
  ]);
  if (policy === undefined) return true;
  const request = context.switchToHttp().getRequest<{ ip?: string }>();
  const key = `${context.getHandler().name}:${request.ip ?? 'unknown'}`;
  if (!this.limiter.consume(key, policy)) {
    throw new AppException(AppErrorCode.TOO_MANY_REQUESTS);
  }
  return true;
  ```

- [ ] **Step 4: Register and apply the guard**

  Provide/export `FixedWindowRateLimiter` and `RateLimitGuard` from `AuthModule`; import `AuthModule` already gives `UsersModule` the guard. Add `@UseGuards(RateLimitGuard)` and `@RateLimit({ limit: 10, windowMs: 60_000 })` to both login methods and refresh. Add the guard with `@RateLimit({ limit: 30, windowMs: 60_000 })` to `verifyNickname`. Do not add an authentication guard to nickname verification.

- [ ] **Step 5: Run focused tests and confirm GREEN**

  Run: `pnpm test src/common/http/fixed-window-rate-limiter.spec.ts src/modules/auth/presentation/auth.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts --runInBand`

  Expected: PASS. Responses after the limit are `429 Z007`; route services receive only allowed requests.

- [ ] **Step 6: Commit the request limit**

  ```bash
  git add src/common/http/fixed-window-rate-limiter.ts src/common/http/fixed-window-rate-limiter.spec.ts src/common/http/rate-limit.decorator.ts src/common/http/rate-limit.guard.ts src/common/http/app-error-code.ts src/modules/auth/auth.module.ts src/modules/auth/presentation/auth.controller.ts src/modules/auth/presentation/auth.controller.spec.ts src/modules/users/users.module.ts src/modules/users/presentation/user.controller.ts src/modules/users/presentation/users.controller.spec.ts
  git commit -m "fix(auth): throttle public requests"
  ```

### Task 5: Verify all contracts and update migration handoff

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [ ] **Step 1: Document the implemented limits**

  In the security/HTTP-contract section, record the exact image limit, MIME allowlist, fixed-window request limits, and the deliberate multi-instance limitation. Do not claim a distributed limiter exists.

- [ ] **Step 2: Run format, static checks, and the full test suite**

  Run:

  ```bash
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm test -- --runInBand
  pnpm test:e2e -- --runInBand
  pnpm test:db -- --runInBand
  ```

  Expected: all commands exit `0`; no unrelated contract changes appear in `git diff`.

- [ ] **Step 3: Commit the handoff update**

  ```bash
  git add docs/migration/2026-07-23-nestjs-migration-handoff.md
  git commit -m "docs: record API abuse safeguards"
  ```
