# Single Environment Compose Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 PostgreSQL 개발·통합 테스트 설정을 `.env`와 `.env.example` 한 쌍으로 줄인다.

**Architecture:** Compose와 Nest 앱은 `.env`의 개발용 `DATABASE_URL`을 사용한다. DB 테스트 구성은 셸·CI가 전달한 `DATABASE_URL`이 없을 때만 그 URL을 파싱해 pathname을 `MOGAK_TEST_DB`로 교체한다. 전역 setup의 `_test` 보호는 변경하지 않는다.

**Tech Stack:** dotenv, Vitest, Docker Compose, PostgreSQL

---

### Task 1: Remove the duplicate test environment file

**Files:**
- Delete: `.env.test.example`
- Modify: `.gitignore`
- Modify: `vitest.db.config.ts`
- Test: `test/database/global-setup.ts`

- [x] **Step 1: Reproduce the missing local test-URL derivation**

Create local `.env` from the tracked example, remove the agent-created ignored `.env.test`, then run:

```bash
env -u DATABASE_URL pnpm test:db
```

Expected before implementation: fail with `DATABASE_URL is required for database integration tests`, because the current configuration reads only `.env.test`.

- [x] **Step 2: Replace `.env.test` loading with local URL derivation**

Replace `vitest.db.config.ts` with:

```ts
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const suppliedDatabaseUrl = process.env.DATABASE_URL;

config({ path: '.env', quiet: true });

if (suppliedDatabaseUrl === undefined) {
  const databaseUrl = process.env.DATABASE_URL;
  const testDatabaseName = process.env.MOGAK_TEST_DB;
  if (databaseUrl !== undefined && testDatabaseName !== undefined) {
    const testDatabaseUrl = new URL(databaseUrl);
    testDatabaseUrl.pathname = `/${testDatabaseName}`;
    process.env.DATABASE_URL = testDatabaseUrl.toString();
  }
}

export default defineConfig({
  test: {
    include: ['test/database/**/*.spec.ts'],
    globalSetup: ['./test/database/global-setup.ts'],
    setupFiles: ['./test/database/setup.ts'],
    restoreMocks: true,
  },
});
```

Delete `.env.test.example` and remove only `!.env.test.example` from `.gitignore`. Do not remove the broad `.env.*` ignore rule.

- [x] **Step 3: Verify local derivation and injected URL precedence**

Run after Compose is healthy:

```bash
env -u DATABASE_URL pnpm test:db
DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/other_test pnpm test:db
```

Expected: the first command passes against `mogak_test`; the second fails with a connection error to port 1, demonstrating that the injected URL was not overwritten.

- [ ] **Step 4: Commit the single-environment implementation**

```bash
git add .gitignore vitest.db.config.ts .env.test.example
git commit -m "test: derive local database test URL"
```

### Task 2: Align documentation with one local environment file

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`
- Modify: `docs/superpowers/specs/2026-07-23-local-postgres-compose-design.md`

- [x] **Step 1: Remove all active `.env.test` setup instructions**

Keep the developer workflow exactly as follows:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm test:db
```

State that local `test:db` uses `.env`'s connection information with only the database name replaced by `MOGAK_TEST_DB`; an externally supplied `DATABASE_URL` remains unchanged.

- [x] **Step 2: Verify the tracked setup surface**

Run:

```bash
rg -n "\.env\.test" .gitignore .env.example compose.yaml vitest.db.config.ts docs/migration docs/superpowers/specs
git ls-files .env.example .env.test.example
```

Expected: no active setup reference to `.env.test`; `.env.example` is the only tracked environment template.

- [x] **Step 3: Run the complete quality gate**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
env -u DATABASE_URL pnpm test:db
```

Expected: every command exits 0, the full suite has zero failures, and all PostgreSQL integration tests pass.

- [ ] **Step 4: Commit final docs and verification state**

```bash
git add docs/migration/2026-07-23-nestjs-migration-handoff.md docs/superpowers/specs/2026-07-23-local-postgres-compose-design.md
git commit -m "docs: simplify local PostgreSQL setup"
```
