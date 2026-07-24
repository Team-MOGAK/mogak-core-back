# Cloud Run 인스턴스별 전역 rate limit 설계

## 목적

모든 HTTP API에 넉넉한 인스턴스별 안전망을 적용하고, 인증·토큰 갱신·닉네임 중복 확인처럼 비용 또는 abuse 위험이 큰 경로에는 더 낮은 제한을 둔다. 이는 Cloud Run 인스턴스 하나에서의 무한 재시도와 단순 반복 호출을 줄이는 보조 장치이며, 분산된 전역 쿼터는 아니다.

## 결정

`@nestjs/throttler`를 사용한다. `ThrottlerModule`은 기본 정책으로 IP별 300회/60초를 등록하고, `APP_GUARD`의 `ThrottlerGuard`를 전역 가드로 등록한다. 패키지 기본 인메모리 저장소를 그대로 사용하므로, 인스턴스 세 대가 실행되면 요청은 라우팅에 따라 최대 약 세 배까지 통과할 수 있고 인스턴스 재시작 시 카운터가 초기화된다.

전역 기본 제한은 정상 모바일 사용과 통신사 NAT의 IP 공유를 고려한 넉넉한 안전망이다. 앱 사용량과 `rate_limit_rejected` 로그를 관찰한 뒤 숫자만 조정할 수 있다. Cloud Armor, Redis, DB 테이블, 분산 락, 벤더별 rate-limit 서비스는 이번 범위에 넣지 않는다.

## 정책

| 대상 | 정책 |
| --- | --- |
| 모든 HTTP API | IP별 300회/60초/인스턴스 |
| `POST /api/auth/login` | IP별 20회/60초/인스턴스 |
| `POST /api/auth/:provider/login` | IP별 20회/60초/인스턴스 |
| `POST /api/auth/refresh` | IP별 60회/60초/인스턴스 |
| `POST /api/users/nickname/verify` | IP별 60회/60초/인스턴스 |
| `GET /health` | 제한 제외 |

경로별 정책은 패키지 표준 `@Throttle({ default: { limit, ttl } })`로 전역 기본값을 덮어쓴다. 헬스 체크는 표준 `@SkipThrottle()`로 제외한다. 기존의 자체 데코레이터, 가드, 버킷 맵, 10,000개 버킷 상한은 제거한다.

## 프록시와 추적 키

Cloud Run의 프록시를 한 홉으로 신뢰하도록 Express의 `trust proxy`를 `1`로 설정한다. 이로써 표준 `ThrottlerGuard`가 사용하는 `request.ip`가 `X-Forwarded-For`의 클라이언트 주소를 사용할 수 있다. 이 값은 직접 노출된 Cloud Run 서비스를 전제로 한다. 외부 HTTPS Load Balancer나 추가 프록시를 도입하면, 배포 경로를 검증한 뒤 같은 변경에서 hop 수 또는 신뢰 프록시 목록을 조정해야 한다.

## 거절 응답과 로그

패키지가 던지는 `ThrottlerException`은 전역 예외 필터에서 그대로 HTTP 429와 패키지 기본 응답 본문으로 반환한다. 기존 `Z007` 앱 오류 응답은 rate limit에 사용하지 않고 제거한다.

필터는 `ThrottlerException`일 때만 Nest `warn` 로그 한 건을 남긴다.

- 이벤트: `rate_limit_rejected`
- 필드: 요청 method, 라우팅된 정적 route 패턴
- 제외: IP, `X-Forwarded-For`, 모든 인증·리프레시 토큰, 헤더, 본문, 쿼리, 동적 경로 파라미터, 예외 객체

허용 요청 및 다른 HTTP 예외는 rate-limit 로그를 남기지 않는다.

## 검증

- 전역 기본 300번째 요청은 통과하고 301번째 요청은 패키지 기본 429 응답을 반환한다.
- 로그인 20, refresh·닉네임 확인 60의 경로별 정책이 전역 300보다 먼저 적용된다.
- `GET /health`는 전역 제한을 소비하거나 거절되지 않는다.
- 429에서만 안전한 `rate_limit_rejected` 로그가 한 번 남고, 기존 앱 예외는 기존 응답 형식을 유지한다.
- 포맷, 린트, 타입 검사, 빌드, Jest, DB·실제 API 시나리오를 포함한 `pnpm verify:local`을 통과한다.
