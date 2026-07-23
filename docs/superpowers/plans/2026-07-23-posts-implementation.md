# Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate authenticated posts, optional image boundary, comments, and likes to NestJS while using a Jogak virtual occurrence rather than Spring's `DailyJogak` rows.

**Architecture:** The `posts` module owns posts, image metadata, comments, likes, response projections, and their hard deletion. It verifies an owned virtual occurrence through the `mogaks` read boundary, then creates a `jogak_executions` row and `posts` row in one short transaction. Natural UNIQUE constraints and `ON CONFLICT` provide duplicate safety; response counts are derived from source rows and no mutation uses a pessimistic lock.

**Tech Stack:** NestJS 11, TypeScript 5.9, Drizzle ORM + PostgreSQL, class-validator, Vitest, Supertest.

---

## Compatibility and agreed changes

- Preserve `POST /api/jogaks/:jogakId/posts`, `GET /api/mogaks/:mogakId/posts`, `GET /api/jogaks/:jogakId/posts?targetDate=`, `GET|PUT|DELETE /api/posts/:postId`, comment CRUD, and `POST /api/posts/like` with `{ postId }`.
- Remove only `dailyJogakId` from post responses. Keep `targetDate` as the date identity.
- Return nested `author` in comment responses, as already approved. Do not invent separate like/unlike paths.
- Accept text-only post creation now. Retain the `multipartFile` field: no/empty files create a post; an actual file reaches the disabled Storage boundary and returns `Z006`. No Storage provider, object cleanup worker, image upload route, or speculative image index is added.
- `posts.jogak_execution_id`, `post_likes(post_id, user_id)` are the only new correctness UNIQUEs. No `DailyJogak`, soft delete, archive state, count columns, `CHECK`, `FOR UPDATE`, slots, or performance indexes.

## File map

| Path | Responsibility |
| --- | --- |
| `src/database/schema/posts.ts` | Post, image metadata, comment, and like tables with cascade ownership. |
| `src/database/schema/posts.spec.ts` | Schema-shape and minimal-UNIQUE regression tests. |
| `drizzle/0002_*.sql` | Posts tables and only their natural uniqueness constraints. |
| `src/common/http/app-error-code.ts` | Existing Spring-compatible Posts/Comments error codes. |
| `src/modules/mogaks/application/jogaks.service.ts` | Export a read-only owned-occurrence resolver for post creation. |
| `src/modules/storage/application/storage.port.ts` | Add the deferred Posts upload capability to the Storage boundary. |
| `src/modules/posts/infrastructure/posts.repository.ts` | Atomic execution/post write and read projections/counts. |
| `src/modules/posts/application/posts.service.ts` | Validation, ownership, hard-delete semantics, like toggle, response policy. |
| `src/modules/posts/presentation/posts.controller.ts` | Legacy routes, multipart boundary, validation, BaseResponse envelopes. |
| `src/modules/posts/posts.module.ts` | Posts module dependency wiring. |
| `src/modules/posts/**/*.spec.ts` | Service, repository intent, and HTTP contract tests. |
| `test/database/posts.integration.spec.ts` | FK cascade, duplicate post, and concurrent-like checks against PostgreSQL. |

### Task 1: Add the normalized Posts schema and error contract

**Files:**
- Create: `src/database/schema/posts.ts`
- Create: `src/database/schema/posts.spec.ts`
- Modify: `src/database/schema/index.ts`
- Create: `drizzle/0002_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/common/http/app-error-code.ts`
- Modify: `src/common/http/app-error-code.spec.ts`

- [ ] **Step 1: Write failing schema/error tests.**

  Assert bigint foreign IDs, FK cascade intent, and only these names:

  ```ts
  expect(posts.jogakExecutionId.notNull).toBe(true);
  expect(posts.authorId.notNull).toBe(true);
  expect(postComments.contents.notNull).toBe(true);
  // posts_jogak_execution_id_unique
  // post_likes_post_user_unique
  ```

  Assert existing Spring definitions `P001`, `P003`, `P005`, `C001`, and `C002` retain their status/code/message.

- [ ] **Step 2: Run the focused tests and verify RED.**

  Run: `pnpm test src/database/schema/posts.spec.ts src/common/http/app-error-code.spec.ts`

  Expected: FAIL because the tables and error definitions do not exist.

- [ ] **Step 3: Add tables and migration.**

  Create exactly:

  ```text
  posts(jogak_execution_id -> jogak_executions CASCADE UNIQUE,
        author_id -> users CASCADE, contents, created_at, updated_at)
  post_images(post_id -> posts CASCADE, storage_key, position, created_at, updated_at)
  post_comments(post_id -> posts CASCADE, author_id -> users CASCADE,
                contents, created_at, updated_at)
  post_likes(post_id -> posts CASCADE, user_id -> users CASCADE, created_at,
             UNIQUE(post_id, user_id))
  ```

  Use application validation for body lengths and image positions. Do not add image-position uniqueness, generated counters, deleted markers, or any index outside primary/UNIQUE constraints.

- [ ] **Step 4: Verify GREEN and commit.**

  Run: `pnpm test src/database/schema/posts.spec.ts src/common/http/app-error-code.spec.ts && pnpm typecheck`

  Commit: `feat: add Posts schema`.

### Task 2: Make owned occurrence resolution and post persistence atomic

**Files:**
- Modify: `src/modules/mogaks/application/jogaks.service.ts`
- Modify: `src/modules/mogaks/mogaks.module.ts`
- Create: `src/modules/posts/infrastructure/posts.repository.ts`
- Create: `src/modules/posts/application/posts.service.ts`
- Create: `src/modules/posts/application/posts.service.spec.ts`

- [ ] **Step 1: Write failing application tests.**

  Cover content validation (nonblank, at most 350), missing/foreign Jogak, an invalid `targetDate`, owner-only read/update/delete, a title snapshot captured on first execution insert, and duplicate post conflict. Cover the required edge:

  ```ts
  await service.createPost(user, { jogakId: 11, targetDate: '2026-07-23', contents: '회고' });
  await expect(service.createPost(user, sameInput)).rejects.toMatchObject({ errorCode: AppErrorCode.POST_ALREADY_EXISTS });
  ```

- [ ] **Step 2: Run focused tests and verify RED.**

  Run: `pnpm test src/modules/posts/application/posts.service.spec.ts`

  Expected: FAIL because Posts services/repository do not exist.

- [ ] **Step 3: Add the read-only Mogaks resolver.**

  Export a method that validates `userId`, `jogakId`, and `scheduledDate` against virtual occurrence rules and returns the Jogak title only when the caller owns that occurrence. It performs no execution mutation; it returns `J005` for an unowned/missing Jogak and `J017` for a non-occurrence.

- [ ] **Step 4: Implement the atomic write without locks.**

  In one short `PostsRepository` transaction:

  1. `INSERT jogak_executions` with `IN_PROGRESS` and title snapshot using `ON CONFLICT DO NOTHING`.
  2. Re-read the execution by `(jogak_id, scheduled_date)` if that insert conflicted.
  3. `INSERT posts` for the execution using `ON CONFLICT DO NOTHING` against `posts.jogak_execution_id`.
  4. Return the created post or the duplicate outcome so the service maps it to `P005`.

  The repository does not lock an execution or post. It does not write an execution status when the row already exists.

- [ ] **Step 5: Run focused tests and commit.**

  Run: `pnpm test src/modules/posts/application/posts.service.spec.ts && pnpm lint && pnpm typecheck`

  Commit: `feat: add execution-backed posts`.

### Task 3: Add post/comment/like projections and mutation rules

**Files:**
- Modify: `src/modules/posts/infrastructure/posts.repository.ts`
- Modify: `src/modules/posts/application/posts.service.ts`
- Create: `src/modules/posts/application/posts.service.spec.ts`

- [ ] **Step 1: Write failing behavior tests.**

  Test all of the following independently:

  ```ts
  it('derives like and comment counts from projection source rows', async () => {});
  it('allows only a post author to update or delete a post', async () => {});
  it('allows only a comment author to update or delete that comment', async () => {});
  it('toggles a like with one unique source row and no stored counter', async () => {});
  it('returns nested comment author data with a resolved profile image URL', async () => {});
  ```

- [ ] **Step 2: Run and verify RED.**

  Run: `pnpm test src/modules/posts/application/posts.service.spec.ts`

  Expected: FAIL on the unimplemented methods.

- [ ] **Step 3: Implement projection and ownership methods.**

  Select post/author/execution/Mogak identity through explicit joins. Derive each count from `post_likes` or `post_comments`; do not persist or update counters. Resolve any stored image key through `StoragePort.resolvePublicUrl`, maintaining `imgUrls` and first-image `thumbnailUrl` behavior. Read methods may use explicit projection queries; they must not produce N+1 queries for list results.

  Implement comment insert/update/delete as direct owned-row DML. Implement post delete as owned-row DML; FK cascades delete image metadata, comments, likes while retaining its Jogak execution. Implement `POST /api/posts/like` with conflict-safe insert, direct owned delete, and the existing Korean created/deleted messages. No `FOR UPDATE` and no counter change occur.

- [ ] **Step 4: Run focused tests and commit.**

  Run: `pnpm test src/modules/posts/application/posts.service.spec.ts && pnpm format:check && pnpm typecheck`

  Commit: `feat: add post comments and likes`.

### Task 4: Expose the public HTTP contract and disabled image boundary

**Files:**
- Create: `src/modules/posts/presentation/posts.controller.ts`
- Create: `src/modules/posts/presentation/posts.controller.spec.ts`
- Create: `src/modules/posts/posts.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write failing controller tests.**

  Assert guard/envelope and these routes:

  ```text
  POST   /api/jogaks/:jogakId/posts              (targetDate, contents, optional multipartFile)
  GET    /api/mogaks/:mogakId/posts?page=&size=
  GET    /api/jogaks/:jogakId/posts?targetDate=
  GET    /api/posts/:postId
  PUT    /api/posts/:postId
  DELETE /api/posts/:postId
  POST   /api/posts/:postId/comments
  GET    /api/posts/:postId/comments
  PUT    /api/posts/:postId/comments/:commentId
  DELETE /api/posts/:postId/comments/:commentId
  POST   /api/posts/like
  ```

  Assert a text-only JSON/multipart create is `201`; empty `multipartFile` behaves as no image; a nonempty file returns `503 Z006`; post responses exclude `dailyJogakId`; comment payloads contain `author`; `POST /api/posts/:postId/like` remains absent.

- [ ] **Step 2: Run focused controller test and verify RED.**

  Run: `pnpm test src/modules/posts/presentation/posts.controller.spec.ts`

  Expected: FAIL because the controller/module does not exist.

- [ ] **Step 3: Implement controllers/module.**

  Use `AccessTokenGuard`, `CurrentUser`, class-validator request DTOs, `FilesInterceptor('multipartFile')`, and `successResponse`. Parse multipart `request` JSON when present and normal JSON otherwise. Do not call Storage for absent/empty files; call the disabled boundary only for nonempty files before database mutation. Add `PostsModule` to `AppModule` and import Database/Auth/Mogaks/Storage modules.

  Extend `StoragePort` with a Posts-upload method and let `DisabledStorageAdapter` throw its existing `Z006` error from that method. The interface addition is intentional: it keeps the controller/application from knowing that Storage is disabled and gives the later serverless adapter a stable ownership boundary. Do not implement persistence or object cleanup in this slice.

- [ ] **Step 4: Verify HTTP GREEN and commit.**

  Run: `pnpm test src/modules/posts/presentation/posts.controller.spec.ts && pnpm test:e2e && pnpm lint`

  Commit: `feat: expose post APIs`.

### Task 5: Extend DB verification and update handoff status

**Files:**
- Create: `test/database/posts.integration.spec.ts`
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [ ] **Step 1: Write PostgreSQL integration cases.**

  Cover user/Post hard-delete cascades, two concurrent insert attempts for one execution resulting in exactly one post, and concurrent same-user likes resulting in one row. Use fixtures with unique data, clean through user hard delete, and rely only on the `_test` database guard.

- [ ] **Step 2: Run the DB test.**

  Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak_test pnpm test:db`

  Expected: PASS when a dedicated PostgreSQL service is available. If no service is running, record only the exact connection prerequisite; do not represent it as a passed check.

- [ ] **Step 3: Run the complete non-DB gate and update documentation.**

  Run:

  ```bash
  pnpm test
  pnpm test:e2e
  pnpm lint
  pnpm format:check
  pnpm typecheck
  pnpm build
  ```

  Document only public source references in section 2 and distinguish implemented code from deferred Storage implementation.

- [ ] **Step 4: Commit verification/docs.**

  Commit: `test: verify Posts persistence`.
