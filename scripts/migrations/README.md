# 운영 SQL 마이그레이션

파일명은 `YYYY-MM-DD-vN-목적.sql` 형식으로 관리한다. 같은 날짜에 순서가 필요한 변경은 `v1`, `v2`처럼 증가시킨다.

| 순서 | 파일 | 적용 대상 | 내용 |
| --- | --- | --- | --- |
| 1 | `2026-08-17-v1-legacy-delete-cascade-post-retention.sql` | 실행하지 않음 | DB cascade를 사용한 초안으로, v2로 대체됐다. |
| 2 | `2026-08-17-v2-application-delete-post-retention.sql` | 기존 Spring 레거시 스키마를 사용하는 운영 DB | 조각 계층 FK를 `ON DELETE NO ACTION`으로 보정하고, `post.daily_jogak_id` FK를 제거한다. 삭제는 애플리케이션 트랜잭션이 수행하며, 중복 방지용 UNIQUE CONSTRAINT만 추가한다. |

운영 DB에는 v2만 한 번 실행한다. 실행 전에는 대상 DB와 적용 이력을 확인하고, 실행 후에는 FK 카탈로그와 애플리케이션 삭제 동작을 확인한다.

## 기존 Spring DB 호환 실행

`pnpm db:migrate`는 현재 Drizzle 신규 스키마용 경로다. 이미 Spring 테이블과 데이터를 가진 DB에는 아래 호환 runner를 사용한다.

```bash
pnpm db:migrate:legacy-compat
```

runner는 하나의 트랜잭션에서 레거시 테이블·고아 관계·요일 값·반복 여부·기존 대상 schedule 충돌을 검사한다. 충돌 ID와 원본/대상 요일 집합을 출력하고 충돌이 있으면 전부 rollback한다. 기존 요일을 교체하는 repair 옵션은 지원하지 않는다. 충돌 데이터의 정정은 적용 이력과 실제 데이터를 검토한 별도 보수 작업으로 다룬다.

수동 보수 작업으로 만료 세션을 정리할 때는 다음 one-shot 명령을 사용한다. 세션 생성 시에는 해당 사용자의 만료 행만 정리하며 활성 세션은 유지한다. 미접속 사용자의 만료 행까지 정리하려면 운영자가 아래 명령을 주기적으로 실행해야 한다. 서버 기동 시 자동 실행되는 작업은 아니다.

```bash
pnpm auth:sessions:cleanup
```
