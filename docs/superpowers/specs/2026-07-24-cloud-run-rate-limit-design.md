# Cloud Run 인스턴스별 rate limit 설계

## 목적

모바일 앱의 비정상 재시도와 단일 인스턴스 안에서의 과도한 반복 요청을 완화한다. 이 제한은 abuse 방어를 위한 전역 쿼터가 아니라 Nest 인스턴스별 보조 안전장치다.

## 결정

Nest의 인메모리 `FixedWindowRateLimiter`를 유지하고 정책값만 조정한다. Cloud Armor, Load Balancer rate limit, Redis, DB 테이블, 분산 락은 이번 범위에 도입하지 않는다.

Cloud Run이 세 인스턴스로 실행되면 각 인스턴스가 독립된 버킷을 가지므로, 한 IP가 실제로 통과할 수 있는 요청 수는 라우팅 상황에 따라 정책값의 최대 약 세 배가 될 수 있다. 인스턴스 재시작도 버킷을 초기화한다. 이 동작은 전역 한도가 필요해질 때 Redis 같은 분산 limiter를 별도 도입하기 전까지 의도적으로 허용한다.

## 정책

각 Nest 인스턴스에서 요청 IP와 handler 이름 조합으로 버킷을 만든다. 최초 허용 요청부터 60초 동안 계수하고, 한도를 넘으면 API 오류 형식의 HTTP 429를 반환한다.

| 대상 | 현재 | 변경 |
| --- | --- | --- |
| Apple 로그인 | 10회/60초 | 20회/60초 |
| provider 로그인 | 10회/60초 | 20회/60초 |
| refresh | 10회/60초 | 60회/60초 |
| 닉네임 중복 확인 | 30회/60초 | 60회/60초 |

버킷은 인스턴스당 최대 10,000개로 제한한다. 만료된 버킷은 새 키를 추가해야 할 때 정리하며, 여전히 가득 차면 가장 오래된 버킷 하나를 비운다.

## 로그

Nest 보조 limiter가 요청을 거절할 때만 `warn` 로그 한 건을 남긴다. 허용된 요청은 로그로 남기지 않는다.

- 이벤트: `rate_limit_rejected`
- 필드: handler 이름, 적용한 `limit`, `windowMs`
- 제외: IP, `Authorization`/`RefreshToken` 헤더, access·refresh token, 요청 본문과 쿼리

이 로그는 인스턴스별 보조 limiter의 거절만 나타낸다. 전역 rate limit 지표나 외부 보안 계층 로그를 대체하지 않는다.

## 구현 범위

- Nest controller의 `@RateLimit` 정책값을 20/60/60으로 조정한다.
- `RateLimitGuard`가 거절 시에만 민감정보 없는 warn 로그를 남긴다.
- 정책 metadata, 429 응답, warn 로그 한 건과 민감정보 미포함을 단위 테스트한다.
- handoff 문서에서 Cloud Run 다중 인스턴스 시 이 제한이 전역이 아님을 명시한다.

Cloud Run 인프라 변경, `trust proxy` 변경, 외부 로그·알림, Redis 도입은 포함하지 않는다.

## 검증과 이후 전환

`pnpm verify:local`로 포맷, 린트, 타입 검사, 빌드, 일반·E2E·DB·실제 HTTP 시나리오를 검증한다.

전역 abuse 방어가 필요해지면 이 limiter를 Redis 원자 카운터 기반 구현으로 교체한다. 그때는 인스턴스 수와 무관한 키·윈도우 정책, 장애 시 동작, Redis 연결·관측 방식을 별도 설계한다.
