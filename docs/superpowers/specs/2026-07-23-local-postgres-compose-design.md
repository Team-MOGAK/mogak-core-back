# Local PostgreSQL Compose Design

## Goal

Nest 저장소가 로컬 PostgreSQL 의존성을 직접 관리한다. 개발과 PostgreSQL 통합 테스트는 컨테이너 하나를 공유하되, 서로 다른 데이터베이스를 사용한다.

## Chosen design

- 루트 `compose.yaml`은 PostgreSQL 17 서비스 하나만 정의한다.
- 첫 초기화 때 `mogak_local`과 `mogak_test`를 생성한다. 개발 앱은 전자만, `test:db`는 후자만 사용한다.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, 호스트 포트, 두 DB 이름은 `.env`에서 제공한다. 실제 `.env`와 `.env.test`는 Git에 넣지 않고, 각각의 `.example`만 추적한다.
- `.env`의 `DATABASE_URL`은 `mogak_local`을, `.env.test`의 `DATABASE_URL`은 `mogak_test`를 가리킨다. Vitest DB 설정은 `.env.test`를 읽되, CI가 주입한 `DATABASE_URL`은 덮어쓰지 않는다.
- Compose는 컨테이너 생명주기만 관리한다. Drizzle migration은 계속 `test:db`의 Vitest 전역 훅이 한 번 실행한다.
- 새 컨테이너의 포트는 현재 Spring 로컬 Compose의 5435와 충돌하지 않도록 5436을 기본값으로 둔다.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `compose.yaml` | PostgreSQL 서비스, healthcheck, named volume, init script mount |
| `docker/postgres/init-databases.sh` | 첫 컨테이너 초기화 때 테스트 DB 생성 |
| `.env.example` | 개발용 `DATABASE_URL` 및 Compose 변수 예시 |
| `.env.test.example` | 테스트용 `DATABASE_URL` 예시 |
| `vitest.db.config.ts` | `.env.test` 로드 및 DB 테스트 파일 선택 |
| `test/database/global-setup.ts` | `_test` DB 보호 확인 후 migration 한 번 실행 |

## Workflow

1. 개발자는 예시 파일을 복사해 `.env`, `.env.test`를 만든다.
2. `docker compose up -d postgres`로 DB를 띄운다.
3. 앱은 `.env`의 `mogak_local` URL로 실행한다.
4. `pnpm test:db`는 `.env.test`의 `mogak_test` URL로 migration과 통합 테스트를 수행한다.

`mogak_test`가 포함된 Postgres volume을 이미 만든 뒤 DB 이름을 바꾸려면, 볼륨을 지우지 않고 별도로 DB를 생성하는 절차를 문서에 안내한다. 테스트 명령은 기존처럼 DB 이름이 `_test`로 끝나지 않으면 실행을 거부한다.

## Non-goals

- Spring 저장소 Compose 설정 재사용 또는 파싱
- Compose 안의 Nest 앱·migration 전용 컨테이너
- 운영 배포 구성
- 테스트마다 새 PostgreSQL 컨테이너 생성
