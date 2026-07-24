# NestJS Throttler Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom instance-local rate limiter with a standard global `@nestjs/throttler` guard, while retaining stricter limits for selected API routes and safe rejection logs.

**Architecture:** `AppModule` owns one `ThrottlerModule` configuration and registers `ThrottlerGuard` through `APP_GUARD`. Controllers use only the package `@Throttle()` override and `@SkipThrottle()` decorators. The global exception filter preserves the package's native 429 response and emits one static, non-sensitive warning for that exception.

**Tech Stack:** NestJS 11, `@nestjs/throttler`, TypeScript, Jest, Supertest, ESLint, Prettier.

---

## File structure

- Modify: `package.json`, `pnpm-lock.yaml` — add the Nest-maintained limiter package.
- Modify: `src/app.module.ts` — register a 300/min default throttler and `APP_GUARD`.
- Modify: `src/app.setup.ts` — trust the direct Cloud Run proxy hop.
- Modify: `src/health/health.controller.ts` — skip the health route.
- Modify: `src/auth/presentation/auth.controller.ts` — use standard 20/20/60 overrides.
- Modify: `src/users/presentation/user.controller.ts` — use the standard 60/min override.
- Modify: `src/common/http/all-exceptions.filter.ts` — preserve 429 and log only safe rejection metadata.
- Delete: `src/common/http/fixed-window-rate-limiter.ts`, `src/common/http/rate-limit.decorator.ts`, `src/common/http/rate-limit.guard.ts` and their specs.
- Modify: `src/auth/presentation/auth.controller.spec.ts`, `src/users/presentation/users.controller.spec.ts` — test stricter standard guard overrides.
- Create: `src/common/http/all-exceptions.filter.spec.ts` — test native throttler response and safe log.
- Create: `test/rate-limit.e2e.spec.ts` — test the production global guard and health exclusion.
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`, `docs/migration/2026-07-24-mobile-migration-follow-up.md` — state the new behavior and limitation.

### Task 1: Establish failing contracts for standard throttling

**Files:**
- Modify: `src/auth/presentation/auth.controller.spec.ts`
- Modify: `src/users/presentation/users.controller.spec.ts`
- Create: `src/common/http/all-exceptions.filter.spec.ts`
- Create: `test/rate-limit.e2e.spec.ts`

- [x] Add `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })` and `{ provide: APP_GUARD, useClass: ThrottlerGuard }` to controller test modules instead of the custom limiter providers.
- [x] Change 21st login and 61st refresh/nickname assertions from `Z007` to `{ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }` and confirm the service call count stops at 20 or 60.
- [x] Add an application integration test: 300 requests to `GET /api/metadata/jobs` return 200 and the 301st returns the native 429 body; 301 `GET /health` requests remain successful.
- [x] Add a unit test for `AllExceptionsFilter` that passes a `ThrottlerException`, expects a single `Logger.warn({ event: 'rate_limit_rejected', method: 'POST', route: '/api/auth/login' })`, and proves tokens, IP, body, query, and exception instances are absent.
- [x] Run the changed specs before installing or registering the package and verify they fail because `@nestjs/throttler` and the native 429 path are absent.

### Task 2: Register the package's global guard and route overrides

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify: `src/app.module.ts`
- Modify: `src/app.setup.ts`
- Modify: `src/health/health.controller.ts`
- Modify: `src/auth/presentation/auth.controller.ts`
- Modify: `src/users/presentation/user.controller.ts`

- [x] Install `@nestjs/throttler` with the project package manager.
- [x] Configure `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })` and `{ provide: APP_GUARD, useClass: ThrottlerGuard }` in `AppModule`.
- [x] Set Express `trust proxy` to `1` in `configureApp` before requests are served.
- [x] Apply `@SkipThrottle()` to `HealthController` and replace the four custom decorators/guards with `@Throttle({ default: { limit, ttl: 60_000 } })`.
- [x] Run the HTTP contract specs and verify the 20/60 overrides, 300 global default, and health exclusion pass.

### Task 3: Preserve standard 429 behavior and remove custom code

**Files:**
- Modify: `src/common/http/all-exceptions.filter.ts`
- Modify: `src/common/http/app-error-code.ts`
- Delete: `src/common/http/fixed-window-rate-limiter.ts`
- Delete: `src/common/http/fixed-window-rate-limiter.spec.ts`
- Delete: `src/common/http/fixed-window-rate-limiter.commonjs.spec.ts`
- Delete: `src/common/http/rate-limit.decorator.ts`
- Delete: `src/common/http/rate-limit.guard.ts`
- Delete: `src/common/http/rate-limit.guard.spec.ts`

- [x] Special-case `ThrottlerException` before generic `HttpException`: preserve Nest's native 429 `{ statusCode, message }` body and emit only the static event, request method, and Express route pattern.
- [x] Delete `TOO_MANY_REQUESTS` because no remaining route uses the application-specific limiter exception.
- [x] Remove every custom limiter source and test, then verify `rg -n 'RateLimitGuard|RateLimit\\(|FixedWindowRateLimiter|TOO_MANY_REQUESTS' src test` has no matches.
- [x] Run the filter, controller, and setup specs until all pass.

### Task 4: Update operational records and verify the integration

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`
- Modify: `docs/migration/2026-07-24-mobile-migration-follow-up.md`
- Modify: `docs/superpowers/specs/2026-07-24-cloud-run-rate-limit-design.md`
- Modify: `docs/superpowers/plans/2026-07-24-nestjs-throttler-migration.md`

- [x] Replace current handoff and mobile follow-up references with the standard guard, 300/20/60 policy, native 429 body, safe log policy, direct-Cloud-Run proxy assumption, and multi-instance limitation.
- [x] Mark completed plan steps and check the design text for placeholders, contradictions, and stale claims.
- [x] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, and `pnpm verify:local`.
- [x] Review only the staged migration diff, then commit it as `feat(rate-limit): adopt nest throttler`.
