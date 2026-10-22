# Discord 오류 알림 운영 가이드

## 동작

- 기존 backend 이미지·프로세스 안에서 HTTP 5xx와 DB pool 오류의 안전한 요약을 Discord webhook으로 비동기 전송합니다.
- HTTP 4xx는 warn 로그로 남기며 알림을 보내지 않습니다.
- 웹훅 응답은 API 응답과 분리됩니다. 전송에는 2초 timeout이 있고 재시도·영속 queue가 없으므로 Discord 장애나 프로세스 종료 중 알림이 유실될 수 있습니다.
- `DISCORD_WEBHOOK_URL`이 비어 있거나 형식이 유효하지 않으면 startup warning을 남기고 API는 정상 시작합니다. alerting만 비활성화됩니다.

## 구현 위치

| 파일                                                                                                      | 역할                                           |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [alerting.module.ts](../../libs/modules/src/infrastructure/alerting/alerting.module.ts)                   | 알림 provider 등록과 연결                      |
| [alertNotifier.ts](../../libs/modules/src/infrastructure/alerting/alertNotifier.ts)                       | 공통 알림 인터페이스와 주입 토큰               |
| [discordWebhookNotifier.ts](../../libs/modules/src/infrastructure/alerting/discordWebhookNotifier.ts)     | Discord 메시지 구성, 웹훅 URL 검사와 HTTP 전송 |
| [database.provider.ts](../../libs/modules/src/infrastructure/database/database.provider.ts)               | Pool 생성과 반환 전 오류 리스너 연결           |
| [databaseExceptionHandler.ts](../../libs/modules/src/infrastructure/database/databaseExceptionHandler.ts) | DB pool 오류의 로그 기록과 알림 요청           |

오류 응답의 상태·코드·메시지는 `libs/shared/src/error/`의 도메인별 파일에서 정의하며, API와 Discord 알림이 같은 정의를 사용합니다.

## 예외 처리 용어

직접 정의하는 예외 타입과 처리기 이름은 `Exception`을 사용합니다. 업무상 실패는 `DomainException`, 모각 도메인의 데이터 불일치는 `MogakException`, 직접 판단한 환경설정 오류는 Nest의 기본 `InternalServerErrorException`으로 구분합니다. JavaScript 예외의 기반 타입과 외부 라이브러리에서 전달되는 값에는 `Error`를 사용합니다. `errorId`, `AppErrorCode`, 로그의 `error` 레벨은 로그·응답을 나타내는 용어입니다.

## 로그 설정과 조회

`LOG_LEVEL`은 `fatal`, `error`, `warn`, `info`, `debug`, `trace` 중 하나를 설정합니다. 누락 시 development는 `debug`, 나머지 환경은 `info`를 사용합니다. 잘못된 값은 서버 시작을 실패시킵니다. 운영 환경에서도 `fatal`을 허용하므로 `error` 로그까지 수집하려면 `error`, `warn`, `info`, `debug`, `trace` 중 하나를 사용합니다.

오류 로그의 경로 필드는 `route` 하나입니다. `baseUrl`과 라우트 패턴을 합쳐 접두사를 포함하고, 동적 경로는 `:id` 형태로 유지합니다.

```json
{
  "event": "unhandled_exception",
  "errorId": "request-id",
  "statusCode": 500,
  "method": "GET",
  "route": "/api/users/:id"
}
```

요청 오류는 요청에 부여된 ID를 사용하며 알림 전송 시 UUID 형식을 강제하지 않습니다. DB pool 오류는 요청과 독립적이므로 별도의 오류 ID를 생성합니다. 같은 `errorId`로 오류 로그와 Discord 알림을 대조합니다. 예외 필터가 알림을 요청한 응답에는 marker를 남겨, 요청 완료 로그에서 같은 오류를 다시 알리지 않도록 합니다.

## Secret 설정

운영 배포 담당자가 기존 backend Cloud Run 서비스의 runtime environment에 Secret Manager secret을 `DISCORD_WEBHOOK_URL` 이름으로 연결해야 합니다. 이 코드 변경은 GCP 리소스, secret, IAM 권한, 서비스 설정을 만들거나 수정하지 않습니다. 실제 서비스명과 secret version은 운영 환경에서 확인하세요.

Webhook은 `https://discord.com/api/webhooks/{numeric-id}/{token}` 형식이어야 합니다. URL은 환경변수로만 전달하고 코드, `.env.example`, Cloud Build substitutions, 명령 인자, 로그, Discord 메시지에 값을 복사하지 마세요. 개발 환경에서는 필요할 때 로컬 `.env`에 넣고 해당 파일을 커밋하지 않습니다.

## 메시지 경계

메시지는 고정 event 요약, 발생 시각, service/environment, errorId, 상태 코드, 검증된 app code, method, `route`의 라우트 패턴, 선택적인 Cloud Logging 검색 링크만 포함합니다. exception message/stack, SQL, body/query, 실제 path ID와 webhook URL은 보내지 않습니다. 멘션은 비활성화됩니다.

## 확인

로컬에서는 가짜 HTTP server를 사용하는 테스트로 전송과 장애 처리를 확인합니다. 실제 배포에서는 다음을 확인합니다.

1. 새 backend revision의 `/health/ready`가 200을 반환하는지 확인합니다. 이 경로는 PostgreSQL 연결도 검사합니다.
2. 시작 로그에 Discord alerting 비활성화 경고가 없는지 확인합니다. 경고가 없다는 사실만으로 Discord 수신이 검증되지는 않습니다.
3. 승인된 테스트 환경에서 5xx 오류를 발생시키고 오류 로그와 Discord 메시지의 `errorId`가 같은지 확인합니다. 완료 로그가 같은 알림을 중복 전송하지 않는지도 확인합니다.
4. 수신되지 않으면 `Discord alert delivery failed` 로그의 상태 코드 또는 network/timeout 분류를 확인합니다. 실패한 알림은 자동 재시도하지 않습니다.

웹훅 URL과 Discord 응답 본문은 로그에 남기지 않습니다. DB pool 오류 처리기는 `DATABASE_URL`과 기존 `APP_DB_URL` 설정 경로 모두에 연결되며, 실제 운영 DB에 오류를 유발하는 확인은 별도 운영 절차를 따릅니다.
