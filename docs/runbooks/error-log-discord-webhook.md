# Discord 오류 알림 운영 가이드

## 동작

- backend `AlertingModule`은 final HTTP 5xx와 DB pool 오류의 안전한 요약을 Discord webhook으로 비동기 전송합니다.
- HTTP 4xx는 warn 로그로 남기며 알림을 보내지 않습니다.
- 웹훅 응답은 API 응답과 분리됩니다. 전송에는 2초 timeout이 있고 재시도·영속 queue가 없으므로 Discord 장애나 프로세스 종료 중 알림이 유실될 수 있습니다.
- `DISCORD_WEBHOOK_URL`이 비어 있거나 형식이 유효하지 않으면 startup warning을 남기고 API는 정상 시작합니다. alerting만 비활성화됩니다.

## Secret 설정

운영 배포 담당자가 기존 backend Cloud Run 서비스의 runtime environment에 Secret Manager secret을 `DISCORD_WEBHOOK_URL` 이름으로 연결해야 합니다. 이 코드 변경은 GCP 리소스, secret, IAM 권한, 서비스 설정을 만들거나 수정하지 않습니다. 실제 서비스명과 secret version은 운영 환경에서 확인하세요.

Webhook은 `https://discord.com/api/webhooks/{numeric-id}/{token}` 형식이어야 합니다. URL은 환경변수로만 전달하고 코드, `.env.example`, Cloud Build substitutions, 명령 인자, 로그, Discord 메시지에 값을 복사하지 마세요. 개발 환경에서는 필요할 때 로컬 `.env`에 넣고 해당 파일을 커밋하지 않습니다.

## 메시지 경계

메시지는 고정 event 요약, 발생 시각, service/environment, errorId, 상태 코드, 검증된 app code, method, 정적 route template, 선택적인 Cloud Logging 검색 링크만 포함합니다. exception message/stack, SQL, body/query, 실제 path ID와 webhook URL은 보내지 않습니다. 멘션은 비활성화됩니다.

## 확인

가짜 HTTP server를 사용하는 로컬 테스트와 CI를 확인합니다. 운영에서는 backend startup warning이 없는지와 alert delivery 실패의 안전한 상태 로그만 확인하세요. 로그에는 webhook URL 또는 응답 본문이 포함되지 않습니다. 실제 Discord 발송 여부는 운영자가 승인된 절차로 별도 확인합니다.
