# Mogaks Virtual Occurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the authenticated Modarat, Mogak, Jogak, category, schedule, virtual-occurrence, and execution APIs to NestJS without recreating Spring's `DailyJogak` pre-generation batch.

**Architecture:** One `mogaks` module owns the complete hierarchy: `User -> Modarat -> Mogak -> Jogak -> Schedule -> Execution`. A schedule determines whether an occurrence exists for a requested date; an execution row is written only for a user action. The only correctness constraints are official-category code and the two natural keys that prevent duplicate weekday rows and duplicate executions. Application validation, short transactions, atomic insert conflict handling, and conditional updates provide consistency without `FOR UPDATE`, pessimistic locks, slots, CHECK constraints, or speculative indexes.

**Tech Stack:** NestJS 11, TypeScript 5.9, Drizzle ORM + PostgreSQL, class-validator, Vitest, Supertest.

---

## Public-source compatibility and approved changes

The public Spring controllers currently expose Modarat/Mogak/Jogak CRUD under `/api`, create a `DailyJogak` at midnight, and mutate it through `dailyJogakId`. This plan preserves every non-DailyJogak route and the BaseResponse envelope, with only these already-approved changes:

- `modarats`, `mogaks`, and `jogaks` remain one NestJS `mogaks` module; they are not independent top-level modules.
- Official Mogak categories are requested as `{ "categoryCode": "CERTIFICATION" }`; one-off user categories use `{ "customCategoryName": "코딩 테스트 준비" }`. The nested `category.type/code` object is not introduced.
- `dailyJogakId` is removed. Execution commands are resource-creation/state-change commands, so they are `POST` routes:

  ```http
  POST /api/jogaks/{jogakId}/executions/{scheduledDate}/start
  POST /api/jogaks/{jogakId}/executions/{scheduledDate}/success
  POST /api/jogaks/{jogakId}/executions/{scheduledDate}/fail
  ```

- Date-list responses identify an occurrence with `jogakId` and `scheduledDate`, never a sentinel or a `dailyJogakId`. They return derived/persisted `status` (`PENDING`, `MISSED`, `IN_PROGRESS`, `SUCCESS`, or `FAIL`) rather than the old ambiguous `isAchievement` flag.
- `GET /api/metadata/mogak-categories` is added as the server-owned category source. No colors metadata route is added: public Spring code accepts a free color string and has no server-owned palette.
- There is no DailyJogak scheduler, midnight failure batch, or Mogak auto-judgement batch. Requests calculate only their requested dates, so database growth follows actual actions rather than every scheduled day.

## File map

| Path | Responsibility |
| --- | --- |
| `src/database/schema/mogaks.ts` | Drizzle hierarchy, schedules, weekday rows, executions, and correctness uniques. |
| `src/database/schema/index.ts` | Re-export Mogaks schema. |
| `drizzle/0001_*.sql` | Versioned hierarchy schema and public official-category seed. |
| `src/common/http/app-error-code.ts` | Legacy-compatible Mogak/Jogak error definitions needed by this slice. |
| `src/modules/mogaks/domain/occurrence.ts` | Pure date occurrence, status derivation, and execution-transition rules. |
| `src/modules/mogaks/infrastructure/mogaks.repository.ts` | Narrow Drizzle ownership, CRUD, list projection, and atomic execution queries. |
| `src/modules/mogaks/application/mogaks.service.ts` | Validation, ownership, limits, transactions, and API response projections. |
| `src/modules/mogaks/presentation/mogaks.controller.ts` | Public controllers, request validation, and approved route changes. |
| `src/modules/mogaks/mogaks.module.ts` | Database/auth dependencies and module registration. |
| `src/modules/mogaks/**/*.spec.ts` | Domain, repository-query, service, and HTTP contract coverage. |
| `src/app.module.ts` | Register `MogaksModule`. |
| `docs/migration/2026-07-23-nestjs-migration-handoff.md` | Record actual public source revision and implemented boundary. |

### Task 1: Add the Mogaks schema, official category data, and error contract

**Files:**
- Create: `src/database/schema/mogaks.ts`
- Create: `src/database/schema/mogaks.spec.ts`
- Modify: `src/database/schema/index.ts`
- Create: `drizzle/0001_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/common/http/app-error-code.ts`
- Modify: `src/common/http/app-error-code.spec.ts`

- [ ] **Step 1: Write failing schema/error contract tests.**

  Assert bigint relation IDs and named correctness constraints, including:

  ```ts
  expect(mogakCategories.code.notNull).toBe(true);
  expect(jogakExecutions.scheduledDate.notNull).toBe(true);
  expect(jogakScheduleWeekdays.scheduleId.notNull).toBe(true);
  // named unique: mogak_categories_code_unique
  // named unique: jogak_schedule_weekdays_schedule_weekday_unique
  // named unique: jogak_executions_jogak_scheduled_date_unique
  ```

  Also assert required public error definitions: `A001`, `M001`, `M002`, `M004`, `J005`, `J009`, `J010`, `J012`, `J013`, `J017`, and an invalid execution-state transition code. The error mapping must preserve the existing Spring status/code/message when it still applies; only the old `dailyJogakId`-specific errors are retired from this slice.

- [ ] **Step 2: Run the focused tests and verify they fail because the schema and errors do not exist.**

  Run: `pnpm test src/database/schema/mogaks.spec.ts src/common/http/app-error-code.spec.ts`

  Expected: FAIL with missing exports/error definitions.

- [ ] **Step 3: Create the normalized Drizzle schema.**

  Use bigint IDs in `{ mode: 'number' }`, timestamptz `created_at`/`updated_at`, and these tables:

  ```text
  modarats(user_id -> users CASCADE, title, color)
  mogak_categories(code UNIQUE, name, active)
  mogaks(modarat_id -> modarats CASCADE, category_id -> mogak_categories nullable,
         custom_category_name nullable, title, color nullable)
  jogaks(mogak_id -> mogaks CASCADE, title)
  jogak_schedules(jogak_id -> jogaks CASCADE, schedule_type, effective_from, effective_to nullable)
  jogak_schedule_weekdays(schedule_id -> jogak_schedules CASCADE, weekday,
                          UNIQUE(schedule_id, weekday))
  jogak_executions(jogak_id -> jogaks CASCADE, scheduled_date, status,
                   jogak_title_snapshot, created_at, updated_at,
                   UNIQUE(jogak_id, scheduled_date))
  ```

  `schedule_type` and execution `status` are varchar values validated in the application, not PostgreSQL enums or CHECK constraints. `mogaks.category_id` and `custom_category_name` are intentionally both nullable at the database boundary; application validation requires exactly one. Do not introduce `user_id` on Mogak/Jogak, `DailyJogak`, `deleted_at`, counter columns, `slot`, a schedule-current flag, or any performance index.

  Apply cascades only down the user-owned hierarchy. Official category definitions are shared reference data and must not cascade-delete Mogaks.

- [ ] **Step 4: Generate and review the migration, then append public category seed data.**

  Run: `pnpm db:generate`

  Seed the public Spring category names with stable internal codes:

  ```text
  CERTIFICATION=자격증, EXTERNAL_ACTIVITY=대외활동, EXERCISE=운동,
  INSIGHT=인사이트, CONTEST=공모전, JOB_STUDY=직무공부,
  INDUSTRY_ANALYSIS=산업분석, LANGUAGE=어학, LECTURE=강연,강의,
  PROJECT=프로젝트, STUDY=스터디, OTHER=기타
  ```

  Migration execution is already tracked by Drizzle; do not add runtime seeding, `WHERE NOT EXISTS`, or extra unique/index structures beyond `code`.

- [ ] **Step 5: Verify schema/migration invariants and commit.**

  Run:

  ```bash
  pnpm test src/database/schema/mogaks.spec.ts src/common/http/app-error-code.spec.ts
  pnpm typecheck
  rg 'CREATE INDEX|CHECK|deleted_at|daily_jogak|slot' drizzle src/database/schema
  ```

  Expected: tests/typecheck pass and ripgrep prints no matches.

  ```bash
  git add src/database/schema drizzle src/common/http
  git commit -m "feat: add Mogaks schema"
  ```

### Task 2: Make occurrence and execution rules pure and test-first

**Files:**
- Create: `src/modules/mogaks/domain/occurrence.ts`
- Create: `src/modules/mogaks/domain/occurrence.spec.ts`
- Create: `src/modules/mogaks/domain/execution-transition.ts`
- Create: `src/modules/mogaks/domain/execution-transition.spec.ts`

- [ ] **Step 1: Write failing occurrence/transition tests.**

  Cover all of these cases before writing the rules:

  ```ts
  it('emits an ONCE occurrence only on effectiveFrom', () => {});
  it('emits WEEKLY occurrences only for stored ISO weekdays inside the inclusive date range', () => {});
  it('derives PENDING for today/future and MISSED for a past occurrence with no execution', () => {});
  it('allows no execution to start, succeed, or fail, and treats a duplicate desired state as idempotent', () => {});
  it('allows SUCCESS and FAIL to switch between each other but never reopens a completed execution', () => {});
  it('rejects an occurrence date that no active schedule covers', () => {});
  ```

- [ ] **Step 2: Run the focused tests and verify they fail.**

  Run: `pnpm test src/modules/mogaks/domain`

  Expected: FAIL because the domain functions do not exist.

- [ ] **Step 3: Implement deterministic rules with no database/Nest dependencies.**

  Use `YYYY-MM-DD` parsing in the controller/application boundary, ISO weekday tokens (`MONDAY`…`SUNDAY`), and date-only comparisons. `ONCE` occurs only on `effectiveFrom`; `WEEKLY` occurs on a stored weekday in the inclusive `[effectiveFrom, effectiveTo]` range, where null `effectiveTo` means ongoing.

  Store only `IN_PROGRESS`, `SUCCESS`, and `FAIL`. Derive `PENDING` and `MISSED` when an execution does not exist. The requested state is a no-op when it already equals the current state. `SUCCESS`/`FAIL` may change between each other, but neither can change to `IN_PROGRESS`; reject that request before a database update. There is no state-history table and no snapshot rewriting; only the Jogak title is captured when an execution is first inserted.

- [ ] **Step 4: Run focused tests, formatter, and commit.**

  Run: `pnpm test src/modules/mogaks/domain && pnpm format:check && pnpm typecheck`

  Expected: PASS.

  ```bash
  git add src/modules/mogaks/domain
  git commit -m "feat: model Jogak virtual occurrences"
  ```

### Task 3: Implement ownership-aware Modarat/Mogak CRUD and category metadata

**Files:**
- Create: `src/modules/mogaks/infrastructure/mogaks.repository.ts`
- Create: `src/modules/mogaks/infrastructure/mogaks.repository.spec.ts`
- Create: `src/modules/mogaks/application/mogaks.service.ts`
- Create: `src/modules/mogaks/application/mogaks.service.spec.ts`
- Create: `src/modules/mogaks/presentation/modarats-mogaks.controller.ts`
- Create: `src/modules/mogaks/presentation/mogaks-metadata.controller.ts`
- Create: `src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts`
- Create: `src/modules/mogaks/mogaks.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write service/controller tests before repositories.**

  Verify that a user can create/list/update/delete only their own Modarat and descendants; another user's IDs must never be accepted merely because the row exists. Include the exact category rules:

  ```ts
  await expect(service.createMogak(userId, {
    modaratId: 3, title: '정보처리기사', categoryCode: 'CERTIFICATION',
  })).resolves.toMatchObject({ category: { code: 'CERTIFICATION', name: '자격증' } });

  await expect(service.createMogak(userId, {
    modaratId: 3, title: '준비', categoryCode: 'CERTIFICATION', customCategoryName: '코테',
  })).rejects.toMatchObject({ errorCode: AppErrorCode.INVALID_PARAMETER });
  ```

  Test inactive/missing official category, missing custom category name, Max-8 Mogaks per Modarat, `GET /api/metadata/mogak-categories`, Modarat's legacy empty `DELETE` response, normal 201 create responses, and BaseResponse envelopes. The max limit is a pre-insert application rule: assert it rejects an already-full sequential request, not that it serializes concurrent requests.

- [ ] **Step 2: Run tests and verify they fail.**

  Run: `pnpm test src/modules/mogaks/application/mogaks.service.spec.ts src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts`

  Expected: FAIL because module/repository/controller exports do not exist.

- [ ] **Step 3: Add narrow repository queries and application ownership rules.**

  Repositories must expose intent-specific methods such as `createModarat`, `findOwnedModarat`, `updateOwnedModarat`, `deleteOwnedModarat`, `listModarats`, `listMogaksForOwnedModarat`, `findOwnedMogak`, `createMogak`, `updateOwnedMogak`, `deleteOwnedMogak`, `listActiveCategories`, and `findActiveCategoryByCode`.

  Determine ownership only through the normalized joins (`Mogak -> Modarat -> User`); never duplicate a user ID on Mogak/Jogak. When an update/delete affects zero owned rows, return the legacy resource-not-found error—not a false success. Deleting a Modarat/Mogak is one DML statement; FK cascades clear descendants. Do not manually enumerate deletions or use a soft-delete marker.

  Validate title/color limits and trim user input. For a Mogak category, accept exactly one of `categoryCode` or `customCategoryName`. Store `categoryId` for an active official code; otherwise store only the custom string. Project responses with the public category object `{ code, name }` for official values or `{ code: null, name: customCategoryName }` for custom values; do not recreate the rejected nested request format.

  Before creating a Mogak, count existing Mogaks in its owned Modarat and reject the 9th sequential request with `J012`. No lock, slot, count cache, or special uniqueness constraint is allowed; the product accepts the extremely rare cross-device create race.

- [ ] **Step 4: Add public controllers and module wiring.**

  Preserve these public paths/methods:

  ```text
  POST   /api/modarats
  GET    /api/modarats
  GET    /api/modarats/:modaratId
  PUT    /api/modarats/:modaratId
  DELETE /api/modarats/:modaratId
  POST   /api/mogaks
  GET    /api/modarats/:modaratId/mogaks
  PUT    /api/mogaks/:mogakId
  DELETE /api/mogaks/:mogakId
  GET    /api/metadata/mogak-categories
  ```

  All write/read routes except category metadata use `AccessTokenGuard` and `CurrentUser`. Keep the Spring `DELETE /api/modarats/:modaratId` empty 200 body. Other successful API responses use `successResponse`; creation uses HTTP 201 with the created envelope. Do not add an API for colors.

- [ ] **Step 5: Run tests and commit the CRUD boundary.**

  Run: `pnpm test src/modules/mogaks/application/mogaks.service.spec.ts src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts && pnpm lint && pnpm typecheck`

  Expected: PASS.

  ```bash
  git add src/modules/mogaks src/app.module.ts
  git commit -m "feat: add Modarat and Mogak APIs"
  ```

### Task 4: Implement Jogak schedules, date projections, and atomic execution commands

**Files:**
- Modify: `src/modules/mogaks/infrastructure/mogaks.repository.ts`
- Modify: `src/modules/mogaks/infrastructure/mogaks.repository.spec.ts`
- Create: `src/modules/mogaks/application/jogaks.service.ts`
- Create: `src/modules/mogaks/application/jogaks.service.spec.ts`
- Create: `src/modules/mogaks/presentation/jogaks.controller.ts`
- Create: `src/modules/mogaks/presentation/jogaks.controller.spec.ts`
- Modify: `src/modules/mogaks/mogaks.module.ts`

- [ ] **Step 1: Write failing Jogak service/controller tests.**

  Cover creation of `ONCE` and `WEEKLY` schedules, malformed weekday lists, inverted ranges, the sequential Max-8 current/future schedule limit, and authorized detail/edit/delete. Test that an update closes the old schedule and inserts a replacement schedule/weekday set in one transaction while existing execution title snapshots remain unchanged.

  For date reads, test `/api/jogaks?date`, `/api/jogaks/daily?date`, `/api/jogaks/routines?startDay&endDay`, and `/api/mogaks/:mogakId/jogaks?date`. The new responses must expose `jogakId`, `scheduledDate`, and `status`, with no `dailyJogakId` or fake `-1` ID.

  For execution commands, assert:

  ```ts
  await start(7, 11, '2026-07-23'); // inserts IN_PROGRESS -> 201
  await start(7, 11, '2026-07-23'); // same state -> 200, no duplicate
  await success(7, 11, '2026-07-23'); // conditional transition -> 200
  await start(7, 11, '2026-07-23'); // completed cannot reopen -> 400
  ```

  Include two simultaneous no-execution requests: one insert wins, the loser re-reads the natural key and receives the same-state success. A date outside the active schedule must return `J017` without inserting an execution.

- [ ] **Step 2: Run focused tests and confirm they fail.**

  Run: `pnpm test src/modules/mogaks/application/jogaks.service.spec.ts src/modules/mogaks/presentation/jogaks.controller.spec.ts`

  Expected: FAIL because Jogak application/presentation classes do not exist.

- [ ] **Step 3: Implement schedules and virtual occurrence projections.**

  Convert the legacy `isRoutine`, `today`, `days`, and `endDate` request shape at the HTTP boundary into:

  ```ts
  type ScheduleInput =
    | { scheduleType: 'ONCE'; effectiveFrom: string }
    | { scheduleType: 'WEEKLY'; effectiveFrom: string; effectiveTo?: string; weekdays: IsoWeekday[] };
  ```

  Preserve existing creation/update paths (`POST /api/jogaks`, `PUT /api/jogaks/:jogakId`) while accepting the explicit new schedule form as the canonical Nest contract. Do not invent a separate schedules API.

  Scheduling rules: `ONCE` has no weekday records and occurs only on its date. `WEEKLY` needs one or more unique weekdays, starts no later than its optional end date, and runs through the end date inclusively. Update schedules in one short transaction: close the currently applicable schedule just before the replacement's `effectiveFrom`, insert replacement, then insert weekdays. Do not lock schedule rows. Normal clients serialize edits; an extraordinarily rare concurrent edit is allowed to be rejected/retried at the application layer rather than protected by a new lock/constraint.

  Read projection queries fetch schedules/weekday rows/executions for only the requested date or range, build occurrences with the pure domain functions, and return stored execution status or derived `PENDING`/`MISSED`. They must not pre-create executions, iterate an unbounded history, or issue per-row follow-up queries.

- [ ] **Step 4: Implement atomic execution persistence with no locks.**

  For each command, first verify the caller owns the Jogak and the requested date is an occurrence. Then:

  1. If no execution exists, attempt one `INSERT` for `(jogak_id, scheduled_date)` with the requested stored status and current Jogak title snapshot.
  2. On the composite UNIQUE conflict, re-read that single execution. If it already has the requested status, return it as an idempotent 200 response.
  3. If the desired transition is allowed, use a conditional `UPDATE … WHERE id = ? AND status = ? RETURNING id` (or equivalent Drizzle predicate). If it lost a race, re-read and apply the same idempotence/transition decision once.
  4. If the transition is impossible, return the application state error. Never issue `SELECT … FOR UPDATE`, retry blindly, or keep a transaction open for external work.

  `INSERT` success is HTTP 201; existing/same-state and conditional state changes are HTTP 200. Reusing an action command is intentionally safe; it never creates two execution rows or two status snapshots.

- [ ] **Step 5: Add controllers and route contract tests.**

  Preserve the public non-DailyJogak routes:

  ```text
  POST   /api/jogaks
  GET    /api/jogaks/:jogakId
  GET    /api/jogaks/daily?date=YYYY-MM-DD
  GET    /api/jogaks?date=YYYY-MM-DD
  GET    /api/jogaks/routines?startDay=YYYY-MM-DD&endDay=YYYY-MM-DD
  GET    /api/mogaks/:mogakId/jogaks?date=YYYY-MM-DD
  PUT    /api/jogaks/:jogakId
  DELETE /api/jogaks/:jogakId
  POST   /api/jogaks/:jogakId/executions/:scheduledDate/start
  POST   /api/jogaks/:jogakId/executions/:scheduledDate/success
  POST   /api/jogaks/:jogakId/executions/:scheduledDate/fail
  ```

  Guard every route. Validate `scheduledDate` and query dates before invoking services. The start/success/fail routes are POST because a missing execution becomes a newly persisted resource; do not use the old PUT `daily-jogaks/:dailyJogakId/*` endpoints.

- [ ] **Step 6: Run all Mogaks tests, static checks, and commit.**

  Run:

  ```bash
  pnpm test src/modules/mogaks
  pnpm lint
  pnpm format:check
  pnpm typecheck
  pnpm build
  ```

  Expected: PASS.

  ```bash
  git add src/modules/mogaks src/app.module.ts
  git commit -m "feat: add Jogak virtual executions"
  ```

### Task 5: Run database integration verification and update the public handoff

**Files:**
- Create: `test/database/mogaks.integration.spec.ts`
- Modify: `test/database/setup.ts`
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [ ] **Step 1: Add PostgreSQL-only integration tests.**

  Reuse the explicit disposable `_test` database guard established by the user/auth slice. Apply migrations, then verify:

  ```ts
  it('cascades Modarat and user hard deletion through Mogak/Jogak/schedules/executions', async () => {});
  it('permits one execution row for concurrent identical occurrence actions', async () => {});
  it('preserves an execution title snapshot after later Jogak title/schedule changes', async () => {});
  it('uses no DailyJogak rows or scheduler writes', async () => {});
  ```

  The concurrency test must execute against PostgreSQL to exercise the actual composite UNIQUE conflict path. It must not use a manual lock, local mutex, or an added index.

- [ ] **Step 2: Execute non-database verification.**

  Run: `pnpm test && pnpm test:e2e && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`

  Expected: PASS.

- [ ] **Step 3: Run database verification only with a disposable PostgreSQL URL.**

  Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak_test pnpm test:db`

  Expected: PASS. If PostgreSQL is unavailable, do not claim database tests passed; keep the command and record the missing dependency in the handoff.

- [ ] **Step 4: Update the handoff using public sources only and commit.**

  Correct the public Spring reference to the actual source revision inspected for this slice, list the controller/scheduler paths used for contract comparison, and mark users/profile/consent/storage-boundary implementation accurately. Do not add a local checkout path, personal branch, private issue, or local observation to section 2.

  Record that the DailyJogak scheduler is intentionally not ported; only actual execution data is stored. Explicitly restate the no-soft-delete/hard-cascade policy and that no performance index was added before measurement.

  ```bash
  git add test/database docs/migration
  git commit -m "test: verify Mogaks persistence"
  ```

## Self-review

- No `DailyJogak`, scheduler, counter cache, soft-delete flag, archive/trash API, anonymization path, `FOR UPDATE`, pessimistic lock, slot, CHECK constraint, PostgreSQL enum, or speculative index exists in this slice.
- Only `mogak_categories.code`, `jogak_schedule_weekdays(schedule_id, weekday)`, and `jogak_executions(jogak_id, scheduled_date)` are new UNIQUE constraints, and each protects a real correctness invariant.
- Ownership never duplicates `user_id` on Mogak or Jogak. Every deletion relies on database cascades rather than an application-managed deletion order.
- Occurrence list reads never materialize date rows. Execution writes are idempotent across retries/concurrent duplicates and never produce stale status/counter data.
- Public Spring CRUD paths are preserved except for the documented DailyJogak and flattened category contract changes. Colors remain a free value, because no public server-owned palette exists.
