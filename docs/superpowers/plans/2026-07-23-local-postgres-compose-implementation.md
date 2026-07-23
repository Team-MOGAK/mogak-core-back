# Local PostgreSQL Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nest 저장소만으로 개발용 `mogak_local`과 통합 테스트용 `mogak_test` PostgreSQL을 재현 가능하게 실행한다.

**Architecture:** 루트 Compose는 PostgreSQL 17 컨테이너 하나와 named volume만 관리한다. Docker 초기화 스크립트가 빈 volume에 테스트 DB를 추가하고, Vitest DB 구성은 `.env.test`만 보조적으로 읽어 CI가 주입한 `DATABASE_URL`을 유지한다. Drizzle migration은 기존 전역 훅이 한 번 실행한다.

**Tech Stack:** Docker Compose, PostgreSQL 17 Alpine, POSIX shell, dotenv, Vitest, Drizzle ORM

---

### Task 1: Reproducible local PostgreSQL service

**Files:**
- Create: `compose.yaml`
- Create: `docker/postgres/init-databases.sh`
- Modify: `.env.example`
- Create: `.env.test.example`
- Modify: `.gitignore`

- [x] **Step 1: Validate the initial absence of a Nest-owned Compose service**

Run: `rg --files -g 'compose*.yaml' -g 'docker-compose*.yaml' -g '.env*.example'`

Expected: no Nest-owned Compose file is present; the existing `.env.example` contains the application defaults that the Compose variables extend.

- [x] **Step 2: Add the PostgreSQL Compose contract and local environment examples**

Create `compose.yaml`:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${MOGAK_LOCAL_DB:-mogak_local}
      POSTGRES_USER: ${MOGAK_DB_USER:-mogak}
      POSTGRES_PASSWORD: ${MOGAK_DB_PASSWORD:?copy .env.example to .env and set MOGAK_DB_PASSWORD}
      MOGAK_TEST_DB: ${MOGAK_TEST_DB:-mogak_test}
      TZ: Asia/Seoul
    ports:
      - '${MOGAK_DB_PORT:-5436}:5432'
    volumes:
      - mogak-postgres-data:/var/lib/postgresql/data
      - ./docker/postgres/init-databases.sh:/docker-entrypoint-initdb.d/01-create-test-database.sh:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mogak-postgres-data:
```

Create executable `docker/postgres/init-databases.sh`:

```sh
#!/bin/sh
set -eu

PGDATABASE="$POSTGRES_DB" createdb --username "$POSTGRES_USER" "$MOGAK_TEST_DB"
```

Extend the existing `.env.example` while retaining its `NODE_ENV`, `PORT`, `JWT_SECRET`, `APPLE_CLIENT_IDS`, and `GOOGLE_CLIENT_IDS` entries:

```dotenv
NODE_ENV=development
PORT=8080
MOGAK_DB_USER=mogak
MOGAK_DB_PASSWORD=replace-with-a-local-password
MOGAK_LOCAL_DB=mogak_local
MOGAK_TEST_DB=mogak_test
MOGAK_DB_PORT=5436
DATABASE_URL=postgresql://mogak:replace-with-a-local-password@127.0.0.1:5436/mogak_local
JWT_SECRET=replace-with-a-local-secret-at-least-32-characters
APPLE_CLIENT_IDS=local-apple-client-id
GOOGLE_CLIENT_IDS=local-google-client-id
```

Create `.env.test.example`:

```dotenv
NODE_ENV=test
DATABASE_URL=postgresql://mogak:replace-with-a-local-password@127.0.0.1:5436/mogak_test
```

Keep actual `.env.test` ignored, but unignore its tracked template:

```gitignore
!.env.test.example
```

- [x] **Step 3: Validate rendered Compose configuration without creating a container**

Run: `docker compose --env-file .env.example config`

Expected: exit 0, a single `postgres` service, host port `5436`, and no secret from a real `.env` file in output.

- [x] **Step 4: Commit the service contract**

```bash
git add compose.yaml docker/postgres/init-databases.sh .env.example .env.test.example .gitignore
git commit -m "chore: add local PostgreSQL compose service"
```

### Task 2: Load local test URL without overriding CI

**Files:**
- Modify: `vitest.db.config.ts`
- Test: `test/database/global-setup.ts`

- [x] **Step 1: Add a failing database-test invocation that has no shell-provided URL**

After creating local `.env.test` from its example and starting Compose, run:

```bash
env -u DATABASE_URL pnpm test:db
```

Expected before implementation: fail with `DATABASE_URL is required for database integration tests`.

- [x] **Step 2: Load `.env.test` at Vitest DB configuration time**

Update `vitest.db.config.ts` to load `.env.test` before defining Vitest. `dotenv` does not override pre-existing variables, so CI-provided `DATABASE_URL` remains authoritative.

```ts
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: '.env.test', quiet: true });

export default defineConfig({
  test: {
    include: ['test/database/**/*.spec.ts'],
    globalSetup: ['./test/database/global-setup.ts'],
    setupFiles: ['./test/database/setup.ts'],
    restoreMocks: true,
  },
});
```

Do not change `test/database/global-setup.ts`; it already proves that the chosen URL ends in `_test` before migration.

- [x] **Step 3: Verify `.env.test` loading and CI override behavior**

Run after Compose is healthy:

```bash
env -u DATABASE_URL pnpm test:db
DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/other_test pnpm test:db
```

Expected: first command passes through `.env.test`; second command attempts the explicitly supplied URL rather than silently replacing it with `.env.test`.

- [ ] **Step 4: Commit the test-environment selection**

```bash
git add vitest.db.config.ts
git commit -m "test: load local database test environment"
```

### Task 3: Document the developer workflow and prove the full stack

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`
- Modify: `README.md` only if it exists when executing this task

- [x] **Step 1: Document the exact local workflow**

Add this workflow near the PostgreSQL integration-test command:

```bash
cp .env.example .env
cp .env.test.example .env.test
# Set the same local password in MOGAK_DB_PASSWORD and .env.test's DATABASE_URL.
docker compose up -d postgres
pnpm test:db
```

State that `mogak_local` is for the app, `mogak_test` is for tests only, the init script runs only for a new named volume, and `docker compose down` preserves data. Do not mention or depend on the Spring repository.

- [x] **Step 2: Run the local dependency and PostgreSQL integration verification**

Run:

```bash
docker compose up -d postgres
docker compose ps
env -u DATABASE_URL pnpm test:db
```

Expected: the healthcheck is healthy and all database integration tests pass against `mogak_test`.

- [x] **Step 3: Run the complete non-DB quality gate**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: every command exits 0; the full suite reports zero failures.

- [ ] **Step 4: Commit docs and final verification state**

```bash
git add docs/migration/2026-07-23-nestjs-migration-handoff.md README.md
git commit -m "docs: document local PostgreSQL workflow"
```

Only stage `README.md` when it actually exists and changed.
