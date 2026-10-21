# MOGAK Core Backend

> 계획한 자기계발을 꾸준히 실행하고, 회고와 네트워킹으로 이어 가는 MOGAK 서비스의 NestJS 백엔드

[서비스 소개](#서비스-소개) · [도메인](#도메인-모델) · [설계-결정](#핵심-설계-결정) · [시작하기](#로컬에서-시작하기) · [검증](#검증) · [문서](#문서)

## 서비스 소개

MOGAK은 카테고리와 반복 일정을 가진 자기계발 목표를 만들고, 매일의 실행과 회고를 기록하는 서비스입니다. 다른 사용자를 팔로우해 페이스메이커의 회고를 확인하거나, 기본 거주지를 기준으로 지역 네트워킹 피드를 탐색할 수 있습니다.

이 저장소는 기존 Spring API의 서비스 의도를 유지하면서 NestJS·TypeScript·PostgreSQL로 백엔드를 재구축하는 프로젝트입니다. 기존 운영 데이터는 이전하지 않으며, 구·신 서버의 이중 쓰기도 하지 않습니다.

## 도메인 모델

```mermaid
flowchart LR
    U[사용자] --> MD[Modarat]
    MD --> MG[Mogak]
    MG --> J[Jogak]
    J --> S[일정]
    S --> O[날짜별 발생 건<br/>jogakId + scheduledDate]
    O --> E[실행 상태]
    O --> P[회고 게시글]
    U --> F[팔로우]
    F --> PF[페이스메이커 피드]
    U --> A[거주지]
    A --> NF[지역 네트워킹 피드]
```

- **Modarat**: 사용자가 만든 상위 묶음입니다.
- **Mogak**: 카테고리·색상을 가진 자기계발 목표입니다.
- **Jogak**: Mogak 안에서 실행할 구체적인 할 일과 반복 일정입니다.
- **날짜별 발생 건**: 일정으로부터 계산되는 그날의 Jogak입니다. 앱에서는 `jogakId + scheduledDate`로 발생 건을 선택하고, 실행 상태가 바뀔 때만 `executionId`를 PK로 가진 실제 실행 기록을 저장합니다.
- **회고 게시글**: 특정 Jogak과 날짜에 연결되는 기록이며, 댓글과 좋아요를 가질 수 있습니다.

## 핵심 설계 결정

| 주제           | 기존 문제                                                             | 현재 결정                                                                                   |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 날짜별 Jogak   | 매일 배치가 `DailyJogak` 행을 미리 만들어 기간에 비례해 데이터가 증가 | 일정에서 발생 건을 계산하고, 실행 저장 시 `UNIQUE (jogak_id, scheduled_date)`로 중복만 방지 |
| 실행 상태      | 동시 생성·재호출 시 중복과 상태 경합 가능성                           | 최소 UNIQUE 제약과 `ON CONFLICT DO NOTHING`·조건부 update로 멱등 처리                       |
| 좋아요·댓글 수 | 저장 카운터와 비관적 락에 정합성이 의존                               | 원본 행에서 집계해 stale 카운터와 넓은 쓰기 락 제거                                         |
| 회원 탈퇴      | 복구 기능 없는 soft delete와 수동 삭제 순서                           | 관계를 따라 정리되는 hard delete                                                            |     |
| 입력 검증      | 요청 경계별 검증 규칙이 분산                                          | Zod와 Nest 어댑터로 Body·Query·Path Parameter를 strict 검증                                 |

## 기술 구성

| 영역              | 선택                       |
| ----------------- | -------------------------- |
| Runtime           | Node.js 24, TypeScript     |
| Framework         | NestJS 11                  |
| Database          | PostgreSQL 17, Drizzle ORM |
| Validation        | Zod, `nestjs-zod`          |
| Test              | Jest, Supertest            |
| Local environment | pnpm, Docker Compose       |

## 로컬에서 시작하기

### 요구 사항

- Node.js : `24.18.x`
- pnpm : `10.32.x`
- Docker 및 Docker Compose

### 1. 환경 변수 생성

```bash
cp .env.example .env
```

`.env`에서 아래 값을 개발 환경에 맞게 바꿉니다.

- `MOGAK_DB_PASSWORD`와 `DATABASE_URL`의 비밀번호는 동일해야 합니다.
- `JWT_SECRET`은 UTF-8 기준 32바이트 이상이어야 합니다.
- `APPLE_CLIENT_IDS`, `GOOGLE_CLIENT_IDS`는 기동 시 필수입니다. 실제 소셜 로그인에는 각 앱의 client ID가 필요합니다.

### 2. PostgreSQL 실행과 migration 적용

```bash
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm start:dev
```

서버는 기본적으로 `http://localhost:8080`에서 기동합니다.

```bash
curl http://localhost:8080/health
# {"status":"ok"}

curl http://localhost:8080/health/ready
# {"status":"ok"}
```

`/health`는 프로세스 생존 확인용이고, `/health/ready`는 PostgreSQL 연결까지 확인하는 배포 readiness probe용이다.

## 검증

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test --runInBand
pnpm test:e2e --runInBand
pnpm test:integration --runInBand
```

`test:integration`은 `.env`의 연결 정보를 바탕으로 `mogak_test` 전용 데이터베이스에서 실행합니다. 테스트 데이터베이스 이름은 반드시 `_test`로 끝나야 합니다. 로컬 Docker Compose를 처음 기동하면 테스트 DB도 함께 생성됩니다.

## 문서

- [NestJS 마이그레이션 설계 및 인수인계](docs/migration/2026-07-23-nestjs-migration-handoff.md)
- [기존 Spring 서버](https://github.com/Team-MOGAK/MOGAK_Spring)

## 운영 로그와 Discord 오류 알림

API 로그는 JSON으로 출력하며 HTTP 4xx는 `warn`, 5xx와 DB pool 오류는 `error`로 분류합니다. 기존 backend 이미지·프로세스 안의 `AlertingModule`이 알림 provider를 연결하고, `DiscordWebhookNotifier`가 Discord webhook으로 비동기 전송합니다. Discord 응답은 API 응답을 지연시키지 않습니다.

로그의 `route`에는 `/api/users/:id`처럼 접두사를 포함한 라우트 패턴을 기록합니다. 요청 오류는 요청 ID를 `errorId`로 재사용하며, 같은 ID로 오류 로그와 Discord 알림을 연결합니다. DB pool 생성은 연결 설정만 담당하고, 별도 `DatabasePoolErrorHandler`가 pool 오류의 로그와 알림을 처리합니다.

`LOG_LEVEL`에 설정한 유효한 값은 환경에 관계없이 적용합니다. 비워 두면 development는 `debug`, 나머지 환경은 `info`입니다. 운영에서도 `fatal`을 설정할 수 있으며, 이 경우 `error` 이하 로그는 출력되지 않습니다.

`DISCORD_WEBHOOK_URL`은 선택 설정입니다. 값이 없거나 유효하지 않으면 시작 경고를 남기고 알림만 끕니다. 운영 배포에서는 기존 backend 서비스의 Secret Manager 환경변수 주입으로 설정합니다. API 이미지나 로그에 secret 값을 넣지 마세요.

전송은 best-effort이며 별도 relay, Pub/Sub, 영속 queue, 재시도가 없습니다. Discord 장애나 backend 프로세스 종료 중 알림이 유실될 수 있습니다. 구현과 운영 경계는 [Discord 오류 알림 가이드](docs/runbooks/error-log-discord-webhook.md)를 따릅니다.

```bash
pnpm test --runInBand test/infrastructure/alerting/discordWebhookNotifier.spec.ts test/common/http/globalException.filter.spec.ts test/database/database.provider.spec.ts test/infrastructure/logging/pinoHttp.options.spec.ts
```
