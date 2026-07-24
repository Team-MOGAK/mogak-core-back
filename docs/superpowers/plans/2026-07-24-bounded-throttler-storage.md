# Bounded Throttler Storage Implementation Plan

> **For agentic workers:** Implement this plan with a failing unit test before production code, then run the focused and full verification gates.

**Goal:** Keep Nest's standard `ThrottlerGuard` and decorators while replacing its faulty default in-memory store with an independent, bounded store.

**Architecture:** `ThrottlerModule` receives a `BoundedThrottlerStorage` instance through its documented `storage` option. The adapter implements only the `ThrottlerStorage` contract: each generated throttler key owns a fixed window and optional block period. No database, distributed cache, lock, custom guard, or custom decorator is added.

**Tech Stack:** NestJS 11, `@nestjs/throttler`, TypeScript, Jest, Supertest.

## Scope

- Create `src/common/http/bounded-throttler.storage.ts`.
- Create its Jest contract test before the implementation.
- Register the storage through `ThrottlerModule.forRoot({ storage })` in the application and guard-based controller test modules.
- Preserve the existing 300/20/60 route policy, global guard, standard 429 response, and safe rejection log.
- Update the rate-limit design and migration handoff to remove the claim that the package default store is used.

## Behavioural contracts

1. A blocked key becomes a fresh fixed-window bucket after its own block period finishes; no other key's expiry can reset it.
2. A stale key is removed when its expiry passes; entries are bounded to 10,000 even under many distinct IPs.
3. The first `limit` requests are allowed. The next request is blocked for `blockDuration`; it returns the standard `ThrottlerStorageRecord` values that `ThrottlerGuard` uses for response headers.
4. On capacity pressure, expired entries are removed first. If every entry is active, the least-recently-used entry is evicted to preserve the process memory bound. This is an instance-local best-effort safeguard, not a distributed security quota.

## Verification

- Add Korean sentence-style Jest cases for independent expiry, expiry removal, and capacity bound.
- Run the new storage spec, the rate-limit E2E spec, and `pnpm verify:local`.
- Review the final diff before one functional commit.
