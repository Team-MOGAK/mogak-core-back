# Local API Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm verify:local`이 실제 Nest API의 인증된 핵심 HTTP 흐름을 한 번에 검증하게 한다.

**Architecture:** 테스트 전용 Node ESM 보조 모듈이 `mogak_test`에 임시 사용자·세션을 생성하고 토큰을 발급한다. 외부 HTTP 시나리오 모듈은 실행 중인 서버에 `fetch`로 요청하고 생성된 ID를 후속 요청에 전달한다. 오케스트레이터는 서버 시작, 시나리오 실행, 종료·정리를 책임진다.

**Tech Stack:** Node.js ESM, `pg`, `jose`, native `fetch`/`FormData`, Jest, NestJS, Drizzle migrations.

---

### Task 1: API 시나리오 실행 계약을 테스트로 고정

**Files:**
- Create: `scripts/local-api-scenario.test.mjs`
- Modify: `scripts/verify-local.test.mjs`

- [x] **Step 1: 실패하는 테스트를 작성한다.**

`node --test`에서 실행할 HTTP 테스트 서버를 만들고, 시나리오가 아래 요청을 순서대로 보낸다고 검증한다.

```js
assert.deepEqual(received.map(({ method, pathname }) => [method, pathname]), [
  ['GET', '/health'],
  ['POST', '/api/modarats'],
  ['POST', '/api/mogaks'],
  ['POST', '/api/jogaks'],
  ['POST', '/api/jogaks/101/executions/2026-07-24/start'],
  ['POST', '/api/jogaks/101/executions/2026-07-24/success'],
  ['POST', '/api/jogaks/101/posts'],
]);
```

`verify-local`의 dry run에는 `node scripts/local-api-scenario.mjs`가 포함되어야 한다.

- [x] **Step 2: 테스트가 실패하는지 확인한다.**

Run: `pnpm test:verify-local`

Expected: `local-api-scenario.mjs`를 찾을 수 없거나 dry-run 명령이 없어 실패한다.

- [x] **Step 3: 최소 구현을 추가한다.**

`scripts/local-api-scenario.mjs`에 `baseUrl`, `accessToken`, `targetNickname`, `date`를 받는 실행 함수를 만든다. 요청마다 `fetch`와 상태·응답 assertion을 사용하고, 모다랏·모각·조각·게시글·댓글 ID를 다음 요청에 사용한다.

- [x] **Step 4: 테스트가 통과하는지 확인한다.**

Run: `pnpm test:verify-local`

Expected: node:test가 0 failures로 끝난다.

### Task 2: 격리된 인증 픽스처를 만든다

**Files:**
- Create: `scripts/local-api-fixture.mjs`
- Create: `scripts/local-api-fixture.test.mjs`

- [x] **Step 1: 실패하는 테스트를 작성한다.**

`pg` Pool을 대체하는 최소 객체를 사용해 fixture가 사용자 두 명, 활성 세션 한 개를 생성하고 cleanup에서 두 사용자 ID로 삭제하는지 검증한다. 발급 Access Token의 `token_type`, `sub`, `id`, `sid`, `role`을 `jwtVerify`로 확인한다.

- [x] **Step 2: 테스트가 실패하는지 확인한다.**

Run: `node --test scripts/local-api-fixture.test.mjs`

Expected: fixture 모듈이 없어 실패한다.

- [x] **Step 3: 최소 구현을 추가한다.**

`createLocalApiFixture({ databaseUrl, jwtSecret })`가 무작위 이메일·닉네임의 `USER` 두 명과 만료 전 `auth_sessions` 행을 생성하도록 구현한다. `jose`의 `SignJWT`로 현재 `TokenService`와 같은 HS256 Access Token claim을 만든다. 반환값의 `cleanup()`은 생성한 사용자만 삭제하고 Pool을 닫는다.

- [x] **Step 4: 테스트가 통과하는지 확인한다.**

Run: `node --test scripts/local-api-fixture.test.mjs`

Expected: node:test가 0 failures로 끝난다.

### Task 3: 오케스트레이터에 실제 API 시나리오를 연결

**Files:**
- Modify: `scripts/verify-local.mjs`
- Modify: `scripts/verify-local.test.mjs`

- [x] **Step 1: 실패하는 테스트를 작성한다.**

Dry run 출력이 test DB migration, `node dist/main.js`, `node scripts/local-api-scenario.mjs` 순서를 모두 포함한다고 검증한다.

- [x] **Step 2: 테스트가 실패하는지 확인한다.**

Run: `pnpm test:verify-local`

Expected: 아직 시나리오 명령이 없어 실패한다.

- [x] **Step 3: 최소 구현을 추가한다.**

`smokeTest`를 `verifyApiScenario`으로 교체한다. 서버 프로세스에는 `mogak_test` URL과 임시 PORT를 넘기고, health 준비 후 `createLocalApiFixture`와 `runLocalApiScenario`를 호출한다. `finally`에서 fixture cleanup과 child process 종료를 수행한다. Docker container와 volume을 중지하거나 삭제하지 않는다.

- [x] **Step 4: 테스트가 통과하는지 확인한다.**

Run: `pnpm test:verify-local`

Expected: node:test가 0 failures로 끝난다.

### Task 4: 전체 검증과 문서 반영

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [x] **Step 1: 문서에 실행 범위를 적는다.**

`pnpm verify:local`이 실제 API 프로세스와 인증된 HTTP 시나리오를 실행하지만 외부 소셜 로그인 토큰은 호출하지 않는다고 적는다.

- [x] **Step 2: 정적·자동 검증을 실행한다.**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:verify-local
pnpm test --runInBand
```

Expected: 모든 명령이 exit code 0으로 끝난다.

- [x] **Step 3: 실제 로컬 검증을 실행한다.**

Run: `pnpm verify:local`

Expected: PostgreSQL 준비, 기존 테스트, 실제 API 시나리오가 순서대로 성공하고 API child process만 종료한다.
