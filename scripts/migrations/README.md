# 운영 SQL 마이그레이션

파일명은 `YYYY-MM-DD-vN-목적.sql` 형식으로 관리한다. 같은 날짜에 순서가 필요한 변경은 `v1`, `v2`처럼 증가시킨다.

| 순서 | 파일 | 적용 대상 | 내용 |
| --- | --- | --- | --- |
| 1 | `2026-08-17-v1-legacy-delete-cascade-post-retention.sql` | 기존 Spring 레거시 스키마를 사용하는 운영 DB | Modarat→Mogak→Jogak→DailyJogak 삭제 연쇄를 보정하고, `post.daily_jogak_id` FK를 제거해 게시글을 보존한다. |

각 SQL은 운영 DB에서 한 번 실행한다. 실행 전에는 대상 DB와 적용 이력을 확인하고, 실행 후에는 FK 카탈로그와 삭제 동작을 확인한다.
