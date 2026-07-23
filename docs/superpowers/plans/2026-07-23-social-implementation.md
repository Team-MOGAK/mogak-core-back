# Social Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate follows, the Pacemaker feed, and the address-based network feed without reviving stored counters, DailyJogak rows, locks, or speculative indexes.

**Architecture:** A `social` module owns the `follows` source table and its write/read repository. It reads Posts, users, jobs, addresses, images, comments, and likes through explicit query projections only. Follow creation is conflict-safe; feed counts are derived from source rows and images/comments are batch-loaded for the visible page.

**Tech Stack:** NestJS 11, TypeScript 5.9, Drizzle ORM + PostgreSQL, class-validator, Vitest, Supertest.

---

## Compatibility decisions

- Keep `POST|DELETE /api/users/follows/:nickname`, counts, motos, mentors, `GET /api/posts/pacemakers?cursor=&size=`, and `GET /api/posts?page=&size=&sort=&address=`.
- The actual Spring controller returns `200 OK` and `result: "SUCCESS"` for follow/unfollow; preserve that runtime behavior rather than its stale OpenAPI 201 annotation.
- Keep `cursor` as a zero-based page number because the Spring implementation passes it to `PageRequest.of`; do not invent opaque cursor tokens.
- Replace only feed/comment author payloads with the approved nested `author`. Do not add `viewCnt`, a like/unlike endpoint, soft delete, `FOR UPDATE`, `CHECK`, slots, or indexes beyond `UNIQUE(follower_id, following_id)`.
- With no `address` query, use the authenticated user's address. Accept only `createdAt` and `likeCnt` sort values. `likeCnt` must derive from `post_likes` at read time.

## File map

| Path | Responsibility |
| --- | --- |
| `src/database/schema/social.ts` | Follows source table and its only natural UNIQUE. |
| `src/database/schema/social.spec.ts` | Schema shape and unique-constraint regression tests. |
| `drizzle/0003_*.sql` | Follows migration and FK cascades. |
| `src/common/http/app-error-code.ts` | Existing `F001` and `F002` errors. |
| `src/modules/social/infrastructure/social.repository.ts` | Follow DML and source-row feed projections. |
| `src/modules/social/application/social.service.ts` | Nickname ownership rules, follow semantics, DTO shaping. |
| `src/modules/social/presentation/social.controller.ts` | Legacy HTTP routes, guard, query DTOs, BaseResponse envelopes. |
| `src/modules/social/social.module.ts` | Database/Auth/Storage dependency wiring. |
| `test/database/social.integration.spec.ts` | PostgreSQL UNIQUE and hard-delete cascade checks. |

### Task 1: Add the follows schema and error contract

**Files:**
- Create: `src/database/schema/social.ts`
- Create: `src/database/schema/social.spec.ts`
- Modify: `src/database/schema/index.ts`
- Create: `drizzle/0003_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/common/http/app-error-code.ts`
- Modify: `src/common/http/app-error-code.spec.ts`

- [ ] **Step 1: Write failing schema and error tests.**

  ```ts
  expect(follows.followerId.notNull).toBe(true);
  expect(follows.followingId.notNull).toBe(true);
  expect(uniqueConstraintNames(follows)).toEqual(['follows_follower_following_unique']);
  expect(AppErrorCode.FOLLOW_ALREADY_EXISTS.code).toBe('F001');
  expect(AppErrorCode.FOLLOW_NOT_FOUND.code).toBe('F002');
  ```

- [ ] **Step 2: Run the focused tests and verify RED.**

  Run: `pnpm test src/database/schema/social.spec.ts src/common/http/app-error-code.spec.ts`

  Expected: FAIL because the social table and error definitions do not exist.

- [ ] **Step 3: Add the minimal schema and migration.**

  ```ts
  export const follows = pgTable(
    'follows',
    {
      id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
      followerId: bigint('follower_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      followingId: bigint('following_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [unique('follows_follower_following_unique').on(table.followerId, table.followingId)],
  );
  ```

  Add `F001`/`F002` with the public Spring status, code, and Korean messages. Do not add a self-follow CHECK.

- [ ] **Step 4: Verify GREEN and commit.**

  Run: `pnpm test src/database/schema/social.spec.ts src/common/http/app-error-code.spec.ts && pnpm db:generate && pnpm typecheck`

  Commit: `feat: add follows schema`.

### Task 2: Implement conflict-safe follow writes and relationship reads

**Files:**
- Create: `src/modules/social/infrastructure/social.repository.ts`
- Create: `src/modules/social/application/social.service.ts`
- Create: `src/modules/social/application/social.service.spec.ts`

- [ ] **Step 1: Write failing service tests.**

  ```ts
  it('keeps nickname as the follow input while storing only two user IDs', async () => {});
  it('maps an insert conflict to F001 without a pre-read lock', async () => {});
  it('rejects self-follow before writing', async () => {});
  it('maps an absent owned delete to F002', async () => {});
  it('returns mentor and moto counts from source rows', async () => {});
  it('returns relationship user summaries through explicit directions', async () => {});
  ```

- [ ] **Step 2: Run the focused tests and verify RED.**

  Run: `pnpm test src/modules/social/application/social.service.spec.ts`

  Expected: FAIL because the service and repository do not exist.

- [ ] **Step 3: Implement direct source-row DML.**

  Resolve `followingId` by nickname; map a missing user to `U001`; reject `followerId === followingId` with `Z005`.

  ```ts
  const [created] = await this.db
    .insert(follows)
    .values({ followerId, followingId })
    .onConflictDoNothing({ target: [follows.followerId, follows.followingId] })
    .returning({ id: follows.id });
  return created !== undefined;
  ```

  For delete, use `DELETE ... WHERE follower_id = ? AND following_id = ? RETURNING id`. Count motos with `following_id = target`, mentors with `follower_id = target`. List the two directions with a users/jobs join; do not store or update counts.

- [ ] **Step 4: Verify GREEN and commit.**

  Run: `pnpm test src/modules/social/application/social.service.spec.ts && pnpm lint && pnpm typecheck`

  Commit: `feat: add follow relationships`.

### Task 3: Add source-row feed projections

**Files:**
- Modify: `src/modules/social/infrastructure/social.repository.ts`
- Modify: `src/modules/social/application/social.service.ts`
- Modify: `src/modules/social/application/social.service.spec.ts`

- [ ] **Step 1: Write failing feed behavior tests.**

  ```ts
  it('uses cursor as a zero-based Pacemaker page and returns only followed authors', async () => {});
  it('uses the authenticated address when the network address query is absent', async () => {});
  it('accepts only createdAt and likeCnt network ordering', async () => {});
  it('derives feed like/comment counts from source rows without viewCnt', async () => {});
  it('returns nested post and comment authors with resolved profile URLs', async () => {});
  it('uses one bounded post projection plus batch image/comment reads for a visible page', async () => {});
  ```

- [ ] **Step 2: Run the focused tests and verify RED.**

  Run: `pnpm test src/modules/social/application/social.service.spec.ts`

  Expected: FAIL on the feed methods.

- [ ] **Step 3: Implement the bounded reads.**

  The post projection joins `posts -> users -> jobs -> addresses -> jogak_executions -> jogaks -> mogaks`; Pacemaker additionally joins `follows` on `following_id = posts.author_id` and filters `follower_id`. Network filters `addresses.name`.

  Project counts with correlated source-row SQL:

  ```ts
  likeCount: sql<number>`(select count(*)::integer from ${postLikes} where ${postLikes.postId} = ${posts.id})`,
  commentCount: sql<number>`(select count(*)::integer from ${postComments} where ${postComments.postId} = ${posts.id})`,
  ```

  For `createdAt`, order by `posts.createdAt DESC, posts.id DESC`; for `likeCnt`, order by derived `likeCount DESC, posts.id DESC`. Read `size + 1`, then batch-load images and comments by visible post IDs. Resolve storage keys through `StoragePort`; omit null image URLs. Build the approved `author` object for each post/comment and never expose storage keys.

- [ ] **Step 4: Verify GREEN and commit.**

  Run: `pnpm test src/modules/social/application/social.service.spec.ts && pnpm format:check && pnpm typecheck`

  Commit: `feat: add social feed projections`.

### Task 4: Expose the legacy Social HTTP contract

**Files:**
- Create: `src/modules/social/presentation/social.controller.ts`
- Create: `src/modules/social/presentation/social.controller.spec.ts`
- Create: `src/modules/social/social.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write failing HTTP contract tests.**

  ```text
  POST   /api/users/follows/:nickname                 -> 200, result "SUCCESS"
  DELETE /api/users/follows/:nickname                 -> 200, result "SUCCESS"
  GET    /api/users/follows/counts/:nickname
  GET    /api/users/follows/:nickname/motos
  GET    /api/users/follows/:nickname/mentors
  GET    /api/posts/pacemakers?cursor=0&size=10
  GET    /api/posts?page=0&size=10&sort=createdAt
  ```

  Assert every route has `AccessTokenGuard`; default network page/address/sort reach the service correctly; `author` replaces flat user fields; `viewCnt` and `POST /api/posts/:postId/like` remain absent.

- [ ] **Step 2: Run the controller test and verify RED.**

  Run: `pnpm test src/modules/social/presentation/social.controller.spec.ts`

  Expected: FAIL because the controller/module does not exist.

- [ ] **Step 3: Add controller and module wiring.**

  Use `@Controller('api')`, `AccessTokenGuard`, `CurrentUser`, `successResponse`, and `asSafeId`-equivalent validation only where IDs exist. Parse `cursor`, `page`, and `size` as nonnegative/positive integers. Make `address` optional; make `sort` optional with `createdAt` default. Import Database/Auth/Storage modules and add `SocialModule` to `AppModule`.

- [ ] **Step 4: Verify HTTP GREEN and commit.**

  Run: `pnpm test src/modules/social/presentation/social.controller.spec.ts && pnpm test:e2e && pnpm lint`

  Commit: `feat: expose social APIs`.

### Task 5: Add database verification and refresh the handoff

**Files:**
- Create: `test/database/social.integration.spec.ts`
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [ ] **Step 1: Write PostgreSQL integration cases.**

  Create two users with unique emails. Assert concurrent same-direction `ON CONFLICT DO NOTHING` inserts persist one `follows` row, reverse-direction follow remains independent, and deleting either user cascades every related follow row. Clean through hard delete.

- [ ] **Step 2: Run the database suite.**

  Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak_test pnpm test:db`

  Expected: PASS only when the guarded `_test` PostgreSQL service is available. Otherwise record the exact connection prerequisite without claiming success.

- [ ] **Step 3: Run the complete non-DB gate and update docs.**

  Run: `pnpm test && pnpm test:e2e && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`

  Update only the public-reference handoff state, its Social implementation status, and remaining Storage/DB prerequisites.

- [ ] **Step 4: Commit verification/docs.**

  Commit: `test: verify Social persistence`.
