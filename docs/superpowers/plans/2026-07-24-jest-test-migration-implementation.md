# Jest Test Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 Nest 백엔드 테스트를 Jest로 실행하고, 시나리오 제목을 한글 명시문으로 통일한다.

**Architecture:** Jest 30 + ts-jest를 사용한다. 운영 빌드는 CommonJS로 유지하고, ESM 전용 `jose`를 실제 실행하기 위해 테스트만 ES2022 모듈과 Node의 VM module runtime으로 실행한다. 일반·E2E 테스트와 PostgreSQL 통합 테스트는 서로 다른 Jest 설정을 사용하지만, DB URL 선택·`_test` 보호·migration 1회 실행은 현재 구현을 그대로 재사용한다.

**Tech Stack:** Node.js 24, TypeScript 5.9, NestJS 11, Jest 30, ts-jest, pnpm, PostgreSQL, Drizzle ORM

---

## 대상 파일과 책임

| 파일 | 변경 |
| --- | --- |
| `package.json` / `pnpm-lock.yaml` | Jest 관련 의존성과 기존 스크립트 이름 연결, Vitest 제거 |
| `jest.config.ts` | 일반·E2E 테스트 설정 |
| `jest.db.config.ts` | DB 통합 테스트 설정과 로컬 DB URL 파생 |
| `tsconfig.spec.json` | Jest 전용 ES2022 모듈과 bundler module resolution |
| `vitest.config.ts` / `vitest.db.config.ts` | 삭제 |
| `src/**/*.spec.ts`, `test/**/*.spec.ts` | Jest mock API와 한글 문장형 시나리오 |
| `test/test-mock.ts` | 기존 Vitest double을 대체하는 테스트 전용 느슨한 mock factory |
| `src/modules/auth/infrastructure/kakao-identity-verifier.spec.ts` | `fetch` 전역 spy와 복원 |
| `docs/migration/2026-07-23-nestjs-migration-handoff.md` | 테스트 러너 정보를 Jest로 갱신 |

### Task 1: Jest 의존성과 실행 설정을 준비한다

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `jest.config.ts`
- Create: `jest.db.config.ts`
- Delete: `vitest.config.ts`
- Delete: `vitest.db.config.ts`

- [x] **Step 1: 현재 Vitest 전체 테스트를 실행해 행동 기준선을 확인한다.**

Run: `pnpm test`

Expected: 107개 일반·E2E 테스트가 통과한다.

- [x] **Step 2: Jest를 설치하되 Vitest는 아직 제거하지 않는다.**

Run: `pnpm add -D jest ts-jest @types/jest @jest/globals`

Expected: `package.json`과 lockfile에 Jest, ts-jest, Jest 타입이 추가된다.

- [x] **Step 3: 일반·E2E용 Jest 설정을 작성한다.**

Create `jest.config.ts`:

```ts
import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/test/database/'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  restoreMocks: true,
};

export default config;
```

- [x] **Step 4: DB 통합 테스트용 Jest 설정을 작성한다.**

Create `jest.db.config.ts`:

```ts
import { config as loadEnv } from 'dotenv';
import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const suppliedDatabaseUrl = process.env.DATABASE_URL;

loadEnv({ path: '.env', quiet: true });

if (suppliedDatabaseUrl === undefined) {
  const databaseUrl = process.env.DATABASE_URL;
  const testDatabaseName = process.env.MOGAK_TEST_DB;
  if (databaseUrl !== undefined && testDatabaseName !== undefined) {
    const testDatabaseUrl = new URL(databaseUrl);
    testDatabaseUrl.pathname = `/${testDatabaseName}`;
    process.env.DATABASE_URL = testDatabaseUrl.toString();
  }
}

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/database/**/*.spec.ts'],
  globalSetup: '<rootDir>/test/database/global-setup.ts',
  setupFiles: ['<rootDir>/test/database/setup.ts'],
  restoreMocks: true,
};

export default config;
```

- [x] **Step 5: 스크립트를 Jest 명령으로 바꾸고 Vitest 설정을 삭제한다.**

Update `package.json` scripts:

```json
{
  "test": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js",
  "test:e2e": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config jest.config.ts test",
  "test:db": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config jest.db.config.ts"
}
```

Delete `vitest.config.ts` and `vitest.db.config.ts`.

- [x] **Step 6: 아직 Vitest import가 남아 있으므로 Jest가 실패하는지 확인한다.**

Run: `pnpm test`

Expected: `Cannot find module 'vitest'` 또는 Jest 전역 API 누락으로 실패한다. 이 실패는 다음 작업의 변환 대상이 실제로 Jest를 통해 실행됨을 확인한다.

### Task 2: 모든 테스트 API를 Jest로 전환한다

**Files:**
- Modify: `src/common/http/api-response.spec.ts`
- Modify: `src/common/http/app-error-code.spec.ts`
- Modify: `src/config/app-env.spec.ts`
- Modify: `src/database/schema/mogaks.spec.ts`
- Modify: `src/database/schema/posts.spec.ts`
- Modify: `src/database/schema/social.spec.ts`
- Modify: `src/database/schema/users.spec.ts`
- Modify: `src/modules/auth/**/*.spec.ts`
- Modify: `src/modules/mogaks/**/*.spec.ts`
- Modify: `src/modules/posts/**/*.spec.ts`
- Modify: `src/modules/social/**/*.spec.ts`
- Modify: `src/modules/storage/**/*.spec.ts`
- Modify: `src/modules/users/**/*.spec.ts`
- Modify: `test/health.e2e.spec.ts`
- Modify: `test/database/**/*.spec.ts`

- [x] **Step 1: 33개 테스트 파일에서 Vitest import를 제거한다.**

Replace each of the following import forms with no test-runner import. Jest provides assertion and lifecycle globals, while files that use `jest.fn`, `jest.mocked`, or `jest.spyOn` must add `import { jest } from '@jest/globals';` because ESM does not inject that identifier:

```ts
import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterAll, describe, expect, it } from 'vitest';
```

The affected files are every `*.spec.ts` under `src` and `test` identified by:

```bash
rg -l "from 'vitest'" src test --glob '*.spec.ts'
```

- [x] **Step 2: mock API를 동등한 Jest API로 치환한다.**

Apply these exact replacements to all affected spec files:

```ts
vi.fn()              // becomes testMock()
vi.mocked(target)    // becomes jest.mocked(target)
vi.resetAllMocks()   // becomes jest.resetAllMocks()
```

Then verify no generic Vitest API remains:

Run: `rg -n "from 'vitest'|\\bvi\\." src test --glob '*.spec.ts'`

Expected: no output, except the Kakao test before Task 3 is completed.

- [x] **Step 3: Kakao fetch mocking을 Jest spy로 전환하고 자동 복원을 검증한다.**

In `src/modules/auth/infrastructure/kakao-identity-verifier.spec.ts`, replace the Vitest global stubbing pattern with:

```ts
afterEach(() => {
  jest.restoreAllMocks();
});

const fetch = jest
  .spyOn(global, 'fetch')
  .mockResolvedValue(new Response(JSON.stringify({ id: 12345 }), { status: 200 }));
```

The rejected-token test must likewise call `jest.spyOn(global, 'fetch').mockResolvedValue(...)`. Keep its existing `AppException(AppErrorCode.INVALID_SOCIAL_TOKEN)` assertion unchanged.

- [x] **Step 4: Jest로 변환된 전체 일반 테스트를 실행한다.**

Run: `pnpm test`

Expected: Jest 출력에서 107개 일반·E2E 테스트가 통과한다. TypeScript type 오류나 mock 복원 누수가 있으면 해당 테스트의 Jest 변환만 고친다.

### Task 3: 테스트 시나리오를 한글 문장형으로 바꾼다

**Files:**
- Modify: Task 2의 모든 `*.spec.ts`

- [x] **Step 1: describe 제목을 한글 대상·상황으로 바꾼다.**

Use names such as these exact patterns:

```ts
describe('애플리케이션 환경 변수', () => {});
describe('헬스체크 엔드포인트', () => {});
describe('조각 실행 상태 전이', () => {});
describe('게시글 PostgreSQL 통합', () => {});
```

Do not keep English-only title strings such as `parseAppEnv`, `GET /health`, `PostsService`, or `Social PostgreSQL integration`.

- [x] **Step 2: 각 it 제목을 한글의 완결된 기대 문장으로 바꾼다.**

Translate the current behavior without changing any assertion. Representative required forms are:

```ts
it('데이터베이스 URL이 없으면 애플리케이션 시작 전에 실패한다', () => {});
it('헬스체크 엔드포인트는 애플리케이션 응답 포맷 없이 정상 상태를 반환한다', async () => {});
it('동일 사용자의 같은 실행 게시글이 동시에 생성되어도 하나만 저장한다', async () => {});
it('로그아웃한 현재 세션은 T005 오류로 거부한다', async () => {});
it('같은 방향의 팔로우는 하나만 유지하고 반대 방향 팔로우는 독립적으로 보존한다', async () => {});
```

Every scenario is an assertion sentence ending in an explicit verb such as `반환한다`, `거부한다`, `저장한다`, `유지한다`, `삭제한다`, or `실패한다`; titles that merely name a feature are not allowed.

- [x] **Step 3: 한글 제목 규칙을 정적 검사한다.**

Run: `rg -n "\\b(describe|it)\\('[A-Za-z]" src test --glob '*.spec.ts'`

Expected: no output. Inspect the test files manually to ensure English identifiers inside the Korean prose are replaced by natural Korean terms rather than merely prefixed.

- [x] **Step 4: 한글 시나리오로 전체 테스트를 다시 실행한다.**

Run: `pnpm test`

Expected: Jest에서 107개 일반·E2E 테스트가 통과하고 모든 출력 이름이 한글 명시문이다.

### Task 4: DB 통합 테스트의 Jest 실행 경계를 검증한다

**Files:**
- Modify: `test/database/global-setup.ts` (only if Jest module loading requires a compatible default export)
- Modify: `test/database/setup.ts` (only if Jest module loading requires a compatible default export)
- Modify: `test/database/mogaks.integration.spec.ts`
- Modify: `test/database/posts.integration.spec.ts`
- Modify: `test/database/social.integration.spec.ts`

- [x] **Step 1: 로컬 URL 파생 DB 테스트를 실행한다.**

Run: `env -u DATABASE_URL pnpm test:db`

Expected: `.env`의 접속 정보에서 DB 이름만 `MOGAK_TEST_DB`로 치환하고 migration을 한 번 실행한 뒤, PostgreSQL 통합 테스트 8개가 Jest로 통과한다.

- [x] **Step 2: 외부 DATABASE_URL 우선순위를 확인한다.**

Run: `DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/other_test pnpm test:db`

Expected: 포트 1 연결 실패가 나타난다. `.env` URL로 덮어쓰지 않았음을 확인한다.

- [x] **Step 3: `_test` 보호 규칙을 확인한다.**

Run: `DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/mogak_local pnpm test:db`

Expected: PostgreSQL 연결 전에 `DATABASE_URL for database integration tests must target a database ending in _test` 오류로 실패한다.

### Task 5: Vitest를 제거하고 문서를 갱신한다

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [x] **Step 1: Vitest 의존성을 제거한다.**

Run: `pnpm remove vitest`

Expected: `package.json`과 lockfile에 직접·전이 Vitest 패키지가 남지 않는다.

- [x] **Step 2: 마이그레이션 문서의 테스트 러너 표기를 Jest로 바꾼다.**

Update the test workflow text to state that `pnpm test`, `pnpm test:e2e`, and `pnpm test:db` are Jest commands, and that DB tests preserve the Jest `globalSetup` migration and `_test` protection.

- [x] **Step 3: Vitest 잔재가 없는지 확인한다.**

Run: `rg -n "vitest|@vitest|\\bvi\\." package.json pnpm-lock.yaml jest.config.ts jest.db.config.ts src test docs/migration`

Expected: current migration documentation must not describe Vitest as the active test runner; no package, config, source test, or test API occurrence remains.

### Task 6: 전체 품질 게이트와 커밋을 수행한다

**Files:**
- Modify: all files changed by Tasks 1-5

- [x] **Step 1: 포맷을 적용한다.**

Run: `pnpm format`

Expected: changed TypeScript, JSON, and Markdown files comply with repository Prettier rules.

- [x] **Step 2: 정적 품질 게이트를 실행한다.**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`

Expected: all four commands succeed.

- [x] **Step 3: 전체 Jest 테스트 게이트를 실행한다.**

Run: `pnpm test && env -u DATABASE_URL pnpm test:db`

Expected: 일반·E2E 107개와 DB 통합 8개가 Jest로 통과한다.

- [x] **Step 4: 변경 범위와 잔재를 검토한다.**

Run: `git diff --check && git status --short && rg -n "from 'vitest'|\\bvi\\." src test --glob '*.spec.ts'`

Expected: whitespace 오류와 Vitest 테스트 API가 없고, 변경 파일은 Jest 전환·한글 시나리오·문서에 한정된다.

- [x] **Step 5: 전환을 한 커밋으로 기록한다.**

Run:

```bash
git add package.json pnpm-lock.yaml jest.config.ts jest.db.config.ts \
  docs/migration/2026-07-23-nestjs-migration-handoff.md src test \
  vitest.config.ts vitest.db.config.ts
git commit -m "test: migrate to Jest"
```

Expected: 테스트 프레임워크 전환과 한글 시나리오가 하나의 재현 가능한 커밋으로 남는다.
