# 운영 SQL 마이그레이션

파일명은 `YYYY-MM-DD-vN-목적.sql` 형식으로 관리한다. 같은 날짜에 순서가 필요한 변경은 `v1`, `v2`처럼 증가시킨다.

| 순서 | 파일 | 적용 대상 | 내용 |
| --- | --- | --- | --- |
| 1 | `2026-08-17-v1-legacy-delete-cascade-post-retention.sql` | 실행하지 않음 | DB cascade를 사용한 초안으로, v2로 대체됐다. |
| 2 | `2026-08-17-v2-application-delete-post-retention.sql` | 기존 Spring 레거시 스키마를 사용하는 운영 DB | 조각 계층 FK를 `ON DELETE NO ACTION`으로 보정하고, `post.daily_jogak_id` FK를 제거한다. 삭제는 애플리케이션 트랜잭션이 수행하며, 중복 방지용 UNIQUE CONSTRAINT만 추가한다. |

운영 DB에는 v2만 한 번 실행한다. 실행 전에는 대상 DB와 적용 이력을 확인하고, 실행 후에는 FK 카탈로그와 애플리케이션 삭제 동작을 확인한다.
