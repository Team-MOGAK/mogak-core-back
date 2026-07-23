# Jest Test Migration Design

## 목적

Nest 백엔드의 모든 자동화 테스트 러너를 Vitest에서 Jest로 전환한다. 테스트가 검증하는 동작, 일반·E2E·PostgreSQL 통합 테스트의 분리, DB 격리 규칙은 바꾸지 않는다.

## 결정

- Jest 30과 `ts-jest`를 사용한다. 운영 Nest 애플리케이션은 CommonJS 빌드를 유지하되, ESM 전용 `jose`를 실제 실행하기 위해 테스트 전용 TypeScript 설정은 ES2022 모듈을 출력한다. 별도 Babel 설정은 추가하지 않는다.
- 테스트 파일은 Jest 전역 API인 `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `afterAll`를 사용한다. ESM 테스트에서 mock API가 필요한 파일은 `@jest/globals`의 `jest`를 명시 import한다. 각 파일의 `vitest` import는 제거한다.
- 모든 테스트 시나리오 제목은 한글 명시문으로 작성한다. `describe`는 대상 또는 상황을, `it`은 기대 결과를 완결된 문장으로 표현한다.
  - 예: `헬스체크 엔드포인트` / `애플리케이션 응답 포맷 없이 정상 상태를 반환한다`
  - 예: `세션 로그아웃` / `로그아웃한 세션은 더 이상 갱신할 수 없다`
- 기존 `vi.fn`, `vi.mocked`, `vi.resetAllMocks`는 각각 Jest 기반 `testMock`, `jest.mocked`, `jest.resetAllMocks`로 전환한다. `fetch` 전역 대체는 Jest의 spy/복원 API로 표현해 테스트 뒤 전역 상태를 남기지 않는다.
- 기존 repository·service double처럼 구체 함수 타입을 선언하지 않았던 mock은 `test/test-mock.ts`의 테스트 전용 helper를 사용한다. 이 helper는 느슨한 mock 설정만 제공하고, 실제 호출 검증은 원래 port·service 타입을 따르는 `jest.mocked`로 유지한다.
- 일반·E2E 테스트와 DB 통합 테스트는 각각 `jest.config.ts`, `jest.db.config.ts`로 분리한다. 두 설정은 `ts-jest` ESM preset과 `tsconfig.spec.json`을 공유하고, 스크립트는 Node의 `--experimental-vm-modules`로 Jest를 실행한다. `test`, `test:e2e`, `test:db` 스크립트 이름은 유지한다.
- DB 설정은 현재와 같이 `.env`를 읽되, 셸·CI가 준 `DATABASE_URL`을 우선한다. 로컬에서는 URL의 DB 이름만 `MOGAK_TEST_DB`로 치환한다. `globalSetup`은 migration을 한 번만 실행하고, `_test`가 아닌 DB는 거부한다.
- Vitest 패키지와 `vitest.config.ts`, `vitest.db.config.ts`는 제거한다.

## 구성

| 파일 | 책임 |
| --- | --- |
| `jest.config.ts` | 일반 단위·HTTP·E2E 테스트 선택, 공통 테스트 환경 로드, DB 테스트 제외 |
| `jest.db.config.ts` | DB 통합 테스트 선택, 로컬 테스트 URL 파생, migration 전역 설정 연결 |
| `tsconfig.spec.json` | Jest만 사용하는 ES2022 모듈 출력과 bundler module resolution |
| `test/setup-env.ts` | 일반 테스트에서 필요한 환경 변수 제공 |
| `test/test-mock.ts` | 기존 테스트 double의 느슨한 return·promise mock 설정을 Jest에서 제공 |
| `test/database/global-setup.ts` | 테스트 DB 보호 확인과 migration 1회 실행 |
| `test/database/setup.ts` | 각 DB 테스트 worker의 DB 이름 보호 확인 |
| `src/**/*.spec.ts`, `test/**/*.spec.ts` | Jest API와 한글 문장형 시나리오로 작성된 테스트 |

## 실행 흐름

1. `pnpm test`는 `src`와 `test`의 일반·E2E 테스트를 실행하고 `test/database`는 제외한다.
2. `pnpm test:e2e`는 `test` 아래의 일반 E2E 테스트만 실행한다.
3. `pnpm test:db`는 `.env` 또는 CI URL에서 `_test` DB를 결정하고 migration을 한 번 실행한 후 `test/database`만 실행한다.
4. Jest 설정의 `restoreMocks: true`는 Vitest의 기존 `restoreMocks` 동작을 그대로 대체한다. 개별 테스트가 선언한 `jest.resetAllMocks()`는 기존처럼 mock 호출과 구현을 초기화한다.

## 검증 기준

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`가 성공한다.
- `pnpm test`가 기존 일반·E2E 테스트를 Jest로 실행한다.
- 로컬 PostgreSQL 환경에서 `env -u DATABASE_URL pnpm test:db`가 `mogak_test`로 실행된다.
- 외부에서 `DATABASE_URL`을 주입하면 그 URL을 그대로 사용하며, `_test`가 아닌 DB는 거부한다.
- 저장소에 `vitest` 의존성, Vitest 설정, `from 'vitest'`, `vi.`가 남지 않는다.

## 범위 밖

- 테스트가 검증하는 제품 기능의 변경
- 새 테스트 기능, coverage 기준, snapshot 도입
- PostgreSQL Compose·DB 스키마·migration 자체의 변경
