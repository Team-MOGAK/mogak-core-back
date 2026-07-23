# MOGAK NestJS 마이그레이션 설계 및 인수인계

작성일: 2026-07-23
상태: 구현 진행 중

## 1. 문서 목적

이 문서는 기존 Spring 서비스를 NestJS로 재구축하기 위해 확인한 실제 코드와 GitHub 이슈, 그리고 설계 논의에서 승인된 결정을 정리한다.

이 문서가 구현의 기준이다. 기존 Spring 코드는 기능 의도와 현재 API를 확인하는 참고 자료로 사용하되, 중복 데이터, 선형적으로 증가하는 배치 데이터, 저장 카운터, 불필요한 락, 사용하지 않는 엔티티까지 그대로 복제하지 않는다.

승인된 설계에 따라 구현을 진행한다. 각 수직 슬라이스는 별도 구현 계획과 검증을 거친다.

## 구현된 기반

- NestJS bootstrap과 Cloud Run `PORT` 바인딩
- 기동 시 검증하는 `DATABASE_URL` 설정
- Drizzle `node-postgres` provider 경계
- BaseResponse 호환 공통 envelope과 전역 오류 매핑
- 인증 없이 확인 가능한 `GET /health`
- `users`, `jobs`, `addresses`, `consent_items`, `user_consents`, `social_accounts`, `auth_sessions`의 첫 Drizzle migration과 공개 메타데이터 seed
- Apple·Google·Kakao 소셜 로그인 검증, `auth_sessions` 기반 동시 로그인, refresh token hash 조건부 회전
- access JWT의 session id 검증, 현재 기기 로그아웃, FK cascade를 이용한 회원 hard delete API
- 사용자 가입, 프로필, 닉네임, 직업, 동의, 직업·주소 메타데이터 API와 비활성 StoragePort 경계
- `mogaks`의 Modarat·Mogak·공식 카테고리, Jogak 일정, 가상 날짜별 발생 건, 실행 상태와 hard delete API
- 실행은 `(jogak_id, scheduled_date)` UNIQUE와 `ON CONFLICT DO NOTHING`/조건부 update로 멱등 처리하며, `achievements`는 `SUCCESS` 실행 원본 행에서 집계
- `posts`의 실행 기반 게시글, 댓글, 좋아요, 파생 카운트, hard delete와 기존 HTTP 경로
- `social`의 nickname 기반 팔로우, Pacemaker·거주지 기반 피드, 원본 행 기반 카운트와 hard delete
- 비어 있거나 없는 `multipartFile`을 허용하고 실제 파일은 현재 비활성 StoragePort에서 `Z006`으로 중단하는 게시글 이미지 경계
- 전용 `_test` 데이터베이스에서 실행하는 Mogaks·Posts PostgreSQL 통합 테스트와 `test:db` 실행 명령

단위·HTTP 계약 테스트, health e2e, 타입 검사, 린트와 빌드는 통과했다. PostgreSQL 통합 테스트는 전용 테스트 DB가 준비된 뒤 실행한다. 현재 개발 환경에는 연결 가능한 PostgreSQL 서비스가 없어 실제 DB 검증은 아직 통과 상태가 아니다.

## 2. 대상 저장소와 확인 기준

이 문서의 근거는 공개적으로 열람 가능한 GitHub 코드와 이슈로 한정한다. 로컬 파일 경로, 개인 개발 환경, 로컬 브랜치·작업 트리의 내용은 포함하지 않는다.

### 새 NestJS 저장소

- 저장소: `https://github.com/Team-MOGAK/mogak-core-back`
- 마이그레이션을 위한 신규 저장소다.
- 공개 저장소의 기본 브랜치는 `main`이다.

### 기존 Spring 저장소

- 저장소: `https://github.com/Team-MOGAK/MOGAK_Spring`
- 확인 브랜치: `develop`
- 확인 커밋: `5dd94ab64f5b288a7dc219f39f6b0a502ba8fda5`

설계 근거로 확인한 주요 파일:

- `sql/schema/00_baseline.sql`
- `sql/seed/00_initial_data.sql`
- `src/main/java/com/mogak/spring/global/ErrorCode.java`
- `src/main/java/com/mogak/spring/web/controller/ModaratController.java`
- `src/main/java/com/mogak/spring/web/controller/MogakController.java`
- `src/main/java/com/mogak/spring/web/controller/JogakController.java`
- `src/main/java/com/mogak/spring/scheduler/Scheduler.java`
- `src/main/java/com/mogak/spring/service/ModaratService.java`
- `src/main/java/com/mogak/spring/service/MogakService.java`
- `src/main/java/com/mogak/spring/service/JogakService.java`

공개 이슈에서 함께 확인한 결정 근거:

- [#174 인덱스 적용 기준 분석](https://github.com/Team-MOGAK/MOGAK_Spring/issues/174): 성능 인덱스는 사전 추가하지 않고 측정 결과로 결정한다.
- [#172 사용자 선택 동의 항목 및 동의 상태 ERD/API 설계](https://github.com/Team-MOGAK/MOGAK_Spring/issues/172): 동의 항목과 사용자 동의 상태를 분리한다.
- [#169 메타데이터 선택지 API](https://github.com/Team-MOGAK/MOGAK_Spring/issues/169): 직무·주소 등 선택지는 서버 메타데이터로 제공한다.
- [#165 이미지 없이 회고 등록](https://github.com/Team-MOGAK/MOGAK_Spring/issues/165): 게시글 이미지는 선택 사항이다.
- [#140 삭제/연관관계 재설계](https://github.com/Team-MOGAK/MOGAK_Spring/issues/140): 회원 삭제는 연결 데이터까지 정리하는 하드 삭제로 설계한다.

## 3. 마이그레이션 범위와 원칙

- Java/Spring Boot 서비스를 TypeScript/NestJS로 새로 구축한다.
- PostgreSQL과 Drizzle ORM을 사용한다.
- 운영 DB의 기존 데이터는 이전하지 않는다.
- 사용자는 재가입하며 기존 콘텐츠도 초기화한다.
- Spring과 NestJS의 이중 쓰기나 구·신 DB 동기화는 하지 않는다.
- 초기 배포는 Cloud Run 단일 컨테이너의 모듈형 모놀리스다.
- Supabase를 DB 또는 Storage 제공자로 사용할 수 있지만 애플리케이션은 제공자에 종속되지 않아야 한다.
- 기존 API는 기본적으로 유지한다. 내부 DB 재설계상 불가피하거나 명시적으로 승인된 계약만 변경한다.
- 모든 테이블을 도메인 객체로 포장하거나 모든 CRUD에 같은 계층을 강제하지 않는다.
- 실제 기능에 없는 보관함, 휴지통, `ARCHIVED` 상태를 새로 만들지 않는다.
- CHECK 제약과 추측성 성능 인덱스를 초기 스키마에 넣지 않는다.
- 정확한 정합성이 필요한 중복만 최소한의 UNIQUE 제약으로 방어한다.

## 4. 실제 코드와 이슈에서 확인한 문제

### 관계와 삭제

[이슈 #140](https://github.com/Team-MOGAK/MOGAK_Spring/issues/140)과 현재 스키마에는 다음 문제가 있다.

- `mogak`이 `modarat`과 `user`를 동시에 참조해 소유자가 중복된다.
- `jogak`이 `mogak`, `user`, `mogak_category`를 중복 참조한다.
- `daily_jogak`이 `jogak`, `mogak`, `mogak_category`, 제목과 반복 여부를 다시 저장한다.
- 회원 탈퇴가 여러 Repository의 수동 삭제 순서에 의존한다.
- 대부분의 핵심 엔티티가 soft delete를 상속하지만 실제 제품에는 휴지통이나 복구 기능이 없다.
- `BlockUser`가 `user_follow` 테이블에 매핑되어 follow와 block의 의미가 섞여 있다.

새 설계는 소유 관계를 한 경로로 정규화하고 FK cascade 기반 hard delete를 사용한다.

### DailyJogak와 스케줄러

기존 `Scheduler`는 매일 자정에 `DailyJogak`을 생성한다. 반복 기간이 길어질수록 실제 수행 여부와 관계없이 행이 선형적으로 증가한다. `DailyJogak`에는 원본에서 조회할 수 있는 모각, 카테고리, 제목, 반복 여부도 중복 저장된다.

새 설계는 날짜별 발생 건을 일정으로부터 계산하고 실제 상태 변경이 있을 때만 실행 행을 만든다.

### 게시글 카운터와 락

`Post`는 `likeCnt`, `commentCnt`, `viewCnt`를 저장한다. [이슈 #132](https://github.com/Team-MOGAK/MOGAK_Spring/issues/132)에는 댓글 삭제가 좋아요 수를 줄이는 오류와, 댓글 확인 전에 카운터를 변경하는 문제가 기록되어 있다. `PostRepository`의 비관적 쓰기 락은 이 저장 카운터를 보호하기 위해 사용된다.

새 설계는 저장 카운터와 해당 락을 모두 제거하고 좋아요와 댓글 원본 행에서 정확한 수를 계산한다. 실제 증가 로직이 없는 조회 수 기능도 제거한다.

### 조회 성능

[이슈 #139](https://github.com/Team-MOGAK/MOGAK_Spring/issues/139)는 피드, 모각, 조각 목록의 N+1 가능성을 다룬다. 새 설계는 목록 응답을 도메인 객체 순회로 조립하지 않고 Drizzle의 명시적인 조회 전용 쿼리와 projection으로 반환한다.

[이슈 #174](https://github.com/Team-MOGAK/MOGAK_Spring/issues/174)의 결론에 따라 실제 조회 조건, 테스트 데이터와 `EXPLAIN ANALYZE` 없이 성능 인덱스를 먼저 만들지 않는다.

### Storage와 선택 이미지

[이슈 #138](https://github.com/Team-MOGAK/MOGAK_Spring/issues/138)은 운영 Storage 구현이 테스트 타입에 의존했던 문제를 다룬다. [이슈 #165](https://github.com/Team-MOGAK/MOGAK_Spring/issues/165)에 따라 게시글 이미지는 선택값으로 유지한다.

새 DB에는 전체 URL이 아닌 storage key만 저장한다. URL은 API 응답 시 `StoragePort`를 통해 만든다.

### API와 인증

- [이슈 #167](https://github.com/Team-MOGAK/MOGAK_Spring/issues/167)에서 정리된 현재 Controller 경로를 API 호환 기준으로 사용한다.
- `POST /api/users/login`은 이메일만으로 JWT를 발급하는 임시 API이므로 제거한다.
- `users.refresh_token` 한 칸만 사용해 동시 로그인을 막는 구조를 세션 단위로 변경한다.
- Apple, Google, Kakao 공급자 토큰은 서버가 검증하고 서비스 JWT를 발급한다.

### 사용하지 않는 기능

다음 엔티티는 실제 Repository, Service, Controller와 사용 API가 없으므로 초기 NestJS 범위에서 제거한다.

- `Notice`, `NoticeImg`
- `Report`, `ReportCategory`
- `BlockUser`

팔로우 기능은 실제 API와 피드가 있으므로 유지한다.

## 5. 애플리케이션 아키텍처

### 최상위 기능 모듈

```text
src/modules/
├── auth/
├── users/
├── mogaks/
├── posts/
├── social/
└── storage/
```

각 모듈의 책임:

- `auth`: 소셜 공급자 검증, 소셜 계정, 서비스 JWT, 인증 세션
- `users`: 사용자 프로필, 직업, 주소, 동의 항목, 사용자 동의
- `mogaks`: Modarat, Mogak, Jogak, 일정, 날짜별 발생 건과 실행
- `posts`: 게시글, 이미지 메타데이터, 댓글, 좋아요
- `social`: 팔로우, 팔로잉 피드, 지역 피드
- `storage`: storage key를 URL로 변환하고 외부 Storage를 호출하는 포트

`modarats`, `mogaks`, `jogaks`는 서로 다른 개념이지만 모두 하나의 `mogaks` 모듈에 포함한다. `consents`, `comments`, `jogaks`를 별도 최상위 모듈로 만들지 않는다.

### 모듈 내부 구조

복잡한 모듈은 다음 구조를 사용한다.

```text
<module>/
├── presentation/
├── application/
├── domain/
└── infrastructure/
```

- `presentation`: Controller, 요청 DTO, 응답 DTO, 인증 사용자 추출
- `application`: 유스케이스, 소유권 확인, 여러 저장 작업의 조합과 트랜잭션 경계
- `domain`: 일정 발생 규칙, 실행 상태 전이처럼 DB나 NestJS 없이 설명할 가치가 있는 규칙
- `infrastructure`: Drizzle Repository, 조회 전용 쿼리, OAuth/JWT/Storage 구현체

단순 CRUD에는 억지로 Domain 클래스를 만들지 않는다. 필요한 경우 `presentation -> application -> infrastructure`로 처리한다.

공통 `BaseRepository`는 만들지 않는다. Repository는 각 유스케이스에 필요한 의도가 드러나는 메서드와 쿼리만 가진다.

다른 모듈의 테이블을 직접 변경하지 않고 해당 모듈이 공개한 Application 경계를 호출한다. 다만 피드처럼 여러 모듈의 데이터를 한 번에 읽어야 하는 조회 전용 쿼리는 필요한 테이블을 조인할 수 있다.

Application Service가 Drizzle transaction을 시작하고 같은 transaction executor를 참여 Repository에 명시적으로 전달한다. Controller와 Domain 계층에는 Drizzle transaction 객체를 노출하지 않는다.

초기에는 CQRS 패키지, 도메인 이벤트 버스, 마이크로서비스 메시징을 도입하지 않는다.

## 6. 데이터 모델 공통 규칙

- 관계형 주요 ID는 PostgreSQL `bigint generated by default as identity`를 사용한다.
- `auth_sessions.id`는 외부에 노출할 도메인 번호가 아니므로 UUID를 사용한다.
- API의 기존 ID 필드는 JSON number를 유지한다.
- Drizzle과 API 경계에서 bigint를 JavaScript safe integer로 검증해 변환한다.
- 날짜별 일정은 서비스 기준 시간대인 `Asia/Seoul`의 calendar date로 계산한다.
- 시각은 `timestamptz`로 저장한다.
- 모든 FK는 null 허용 여부와 삭제 정책을 명시한다.
- soft delete 컬럼인 `deleted_at`을 두지 않는다.
- CHECK 제약을 사용하지 않는다.
- 일반 성능 인덱스를 초기 스키마에 명시하지 않는다.
- PK 및 UNIQUE 제약으로 PostgreSQL이 생성하는 인덱스는 정합성 비용으로 허용한다.

## 7. 승인된 핵심 관계

```text
users
└── modarats
    └── mogaks
        └── jogaks
            ├── jogak_schedules
            │   └── jogak_schedule_weekdays
            └── jogak_executions
                └── posts
                    ├── post_images
                    ├── post_comments
                    └── post_likes
```

- `users 1:N modarats`
- `modarats 1:N mogaks`
- `mogaks 1:N jogaks`
- `jogaks 1:N jogak_schedules`
- `jogaks 1:N jogak_executions`
- `jogak_executions 1:0..1 posts`

모든 Mogak은 반드시 Modarat에 속한다.

- `mogaks.modarat_id NOT NULL`
- 기존 `mogaks.user_id` 제거
- 기존 `jogaks.user_id` 제거
- 기존 `jogaks.mogak_category` 제거

소유자는 `Jogak -> Mogak -> Modarat -> User` 경로로 판정한다. 게시글은 피드 조회와 작성자 생명주기를 위해 `author_id`를 직접 가진다. 이는 단순 중복이 아니라 게시글 저자라는 별도 의미다.

## 8. 테이블 설계

아래는 구현 계획의 기준이 되는 논리 스키마다. 문자열 길이처럼 기존 API 검증으로 충분한 세부 물리 타입은 Drizzle 스키마 작성 단계에서 기존 계약과 함께 확정한다.

### users 영역

#### `users`

- `id bigint PK`
- `job_id bigint nullable FK -> jobs`
- `address_id bigint nullable FK -> addresses`
- `nickname nullable`
- `email nullable`
- `gender nullable`
- `age nullable`
- `role`
- `profile_image_key nullable`
- `created_at`, `updated_at`

기존 사용자 필드인 nickname, job, address, gender, age, email, role을 유지한다. `profile_img_url`은 제거하고 기존 `profile_img_name`의 역할을 명확히 한 `profile_image_key`만 저장한다.

`nickname`은 팔로우 API에서 사용자를 식별하므로 값이 존재할 때 UNIQUE다. 가입 전 null은 허용하며 hard delete 후 닉네임은 즉시 재사용할 수 있다. 초기에는 현재 API처럼 대소문자를 구분한다.

`email`도 nullable UNIQUE다. 이는 이메일로 계정을 자동 연결하려는 용도가 아니라, 서로 다른 공급자의 새 계정이 같은 이메일을 주장할 때 기존 계정 연결 필요 오류로 막기 위한 현재 계약의 정합성 제약이다. PostgreSQL의 UNIQUE는 여러 `NULL`을 허용하므로 이메일 없는 Kakao 계정은 계속 지원한다.

#### `jobs`, `addresses`

직업과 거주지의 공통 정의를 저장한다. 사용자가 탈퇴해도 정의 데이터는 유지한다. 기존 메타데이터 API 계약을 유지한다.

#### `consent_items`

- `id bigint PK`
- `code`
- `name`
- `description nullable`
- `required`
- `active`
- `created_at`, `updated_at`
- `UNIQUE(code)`

#### `user_consents`

- `id bigint PK`
- `user_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `consent_item_id bigint NOT NULL FK -> consent_items`
- `agreed`
- `agreed_at nullable`
- `withdrawn_at nullable`
- `created_at`, `updated_at`
- `UNIQUE(user_id, consent_item_id)`

동의 항목 정의와 사용자의 현재 동의 상태만 관리한다. 별도 이력 테이블과 약관 버전 테이블은 초기 범위에 넣지 않는다. 사용자는 동의 상태를 수정할 수 있고, 회원 탈퇴 시 사용자 동의 행도 hard delete한다.

### auth 영역

#### `social_accounts`

- `id bigint PK`
- `user_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `provider`
- `provider_user_id`
- `email nullable`
- `created_at`, `updated_at`
- `UNIQUE(provider, provider_user_id)`
- `UNIQUE(user_id, provider)`

한 사용자는 여러 공급자 계정을 가질 수 있지만 같은 공급자의 계정은 하나만 연결한다. 이메일이 같다는 이유만으로 자동 연결하지 않는다.

#### `auth_sessions`

- `id uuid PK`
- `user_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `refresh_token_hash`
- `expires_at`
- `created_at`, `updated_at`

외부 API와 JWT의 이름은 계속 `refreshToken`을 사용한다. `auth_sessions`는 refresh token 자체의 새 이름이 아니라 동시 로그인 가능한 서버 측 세션 레코드다.

### mogaks 영역

#### `modarats`

- `id bigint PK`
- `user_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `title`
- `color`
- `created_at`, `updated_at`

#### `mogak_categories`

- `id bigint PK`
- `code`
- `name`
- `active`
- `created_at`, `updated_at`
- `UNIQUE(code)`

공식 카테고리 정의다. 사용자 커스텀 카테고리는 이 테이블에 자동 등록하지 않는다.

#### `mogaks`

- `id bigint PK`
- `modarat_id bigint NOT NULL FK -> modarats ON DELETE CASCADE`
- `category_id bigint nullable FK -> mogak_categories`
- `custom_category_name nullable`
- `title`
- `color nullable`
- `created_at`, `updated_at`

애플리케이션은 `category_id`와 `custom_category_name` 중 정확히 하나만 저장하도록 검증한다. DB CHECK 제약은 사용하지 않는다.

#### `jogaks`

- `id bigint PK`
- `mogak_id bigint NOT NULL FK -> mogaks ON DELETE CASCADE`
- `title`
- `created_at`, `updated_at`

기존의 `user_id`, `mogak_category`, `is_routine`, `achievement`, `state`, `start_at`, `end_at`은 제거한다. 사용자와 카테고리는 상위 관계에서 조회하고, 일정과 실행 상태는 별도 테이블에서 관리한다.

#### `jogak_schedules`

- `id bigint PK`
- `jogak_id bigint NOT NULL FK -> jogaks ON DELETE CASCADE`
- `schedule_type`: 애플리케이션 enum `ONCE | WEEKLY`
- `effective_from`
- `effective_to nullable`
- `created_at`

`ONCE`는 `effective_from`의 하루만 발생한다. `WEEKLY`는 유효 기간과 요일 조합으로 발생한다. 날짜 범위와 타입별 필수값은 애플리케이션에서 검증한다.

일정 수정은 가능하다. 수정 시 현재 유효 구간을 닫고 새 일정 행을 추가한다. 이미 생성된 실행 기록은 변경하지 않는다. Jogak 제목 자체의 수정은 현재 제목을 갱신하지만 과거 실행의 제목 snapshot은 바꾸지 않는다.

#### `jogak_schedule_weekdays`

- `id bigint PK`
- `schedule_id bigint NOT NULL FK -> jogak_schedules ON DELETE CASCADE`
- `weekday`
- `UNIQUE(schedule_id, weekday)`

`WEEKLY` 일정에만 사용한다. 기존 `period`, `jogak_period` 테이블은 제거한다.

#### `jogak_executions`

- `id bigint PK`
- `jogak_id bigint NOT NULL FK -> jogaks ON DELETE CASCADE`
- `scheduled_date`
- `status`: 애플리케이션 enum `IN_PROGRESS | SUCCESS | FAIL`
- `jogak_title_snapshot`
- `created_at`, `updated_at`
- `UNIQUE(jogak_id, scheduled_date)`

실행에는 과거 화면에 필요한 Jogak 제목만 snapshot으로 저장한다. 사용자, Mogak, 카테고리는 복사하지 않는다.

### posts 영역

#### `posts`

- `id bigint PK`
- `jogak_execution_id bigint NOT NULL FK -> jogak_executions ON DELETE CASCADE`
- `author_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `contents`
- `created_at`, `updated_at`
- `UNIQUE(jogak_execution_id)`

하나의 실행에는 게시글이 최대 하나만 존재한다. 게시글 작성 시 인증 사용자가 실행의 소유자인지 검증한다. 작성자는 이후 변경하지 않는다.

기존 `like_cnt`, `comment_cnt`, `view_cnt`, `post_thumbnail_url`은 제거한다.

#### `post_images`

- `id bigint PK`
- `post_id bigint NOT NULL FK -> posts ON DELETE CASCADE`
- `storage_key`
- `position`
- `created_at`, `updated_at`

이미지는 선택값이다. `position = 0`인 첫 이미지를 썸네일로 응답하며 별도 썸네일 URL 컬럼을 저장하지 않는다.

#### `post_comments`

- `id bigint PK`
- `post_id bigint NOT NULL FK -> posts ON DELETE CASCADE`
- `author_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `contents`
- `created_at`, `updated_at`

댓글은 작성자 본인만 수정하거나 삭제할 수 있다.

#### `post_likes`

- `id bigint PK`
- `post_id bigint NOT NULL FK -> posts ON DELETE CASCADE`
- `user_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `created_at`
- `UNIQUE(post_id, user_id)`

게시글 좋아요 수는 이 테이블의 행을 집계한다.

### social 영역

#### `follows`

- `id bigint PK`
- `follower_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `following_id bigint NOT NULL FK -> users ON DELETE CASCADE`
- `created_at`
- `UNIQUE(follower_id, following_id)`

자기 자신 팔로우 금지와 같은 규칙은 애플리케이션에서 검증한다.

## 9. DailyJogak 제거와 날짜별 발생 건

날짜별 Jogak은 DB에 미리 만드는 엔티티가 아니라 일정으로부터 계산하는 발생 건이다.

조회 날짜에 대해:

1. 해당 날짜가 일정의 유효 기간인지 확인한다.
2. `ONCE`면 지정 날짜와 일치하는지 확인한다.
3. `WEEKLY`면 요일이 `jogak_schedule_weekdays`에 있는지 확인한다.
4. `(jogak_id, scheduled_date)` 실행 행을 left join한다.
5. 실행 행이 없고 날짜가 오늘 또는 미래면 `PENDING`을 반환한다.
6. 실행 행이 없고 날짜가 과거면 `MISSED`를 반환한다.
7. 실행 행이 있으면 저장된 `IN_PROGRESS`, `SUCCESS`, `FAIL`을 반환한다.

`PENDING`과 `MISSED`는 파생 상태이며 DB에 저장하지 않는다.

실행 행은 다음 행위가 최초로 발생할 때만 생성한다.

- 시작
- 성공
- 실패
- 게시글 생성

허용 상태 전이:

- 없음 -> `IN_PROGRESS | SUCCESS | FAIL`
- `IN_PROGRESS` -> `SUCCESS | FAIL`
- `SUCCESS` <-> `FAIL`
- 현재 상태와 같은 요청 -> 현재 상태를 반환하는 멱등 응답

완료 상태를 다시 `IN_PROGRESS`로 되돌리지는 않는다. 상태 변경 이력 테이블은 만들지 않는다.

이 구조에서는 자정 DailyJogak 생성 배치와 4시 Mogak 성공/실패 판정 배치가 필요 없다. 스케줄 조회량은 요청한 기간에 비례하고, DB 저장량은 실제 사용자의 행위에 비례한다.

## 10. 원자성, 동시성, 멱등성

### 기본 원칙

- 비관적 락과 `SELECT ... FOR UPDATE`를 사용하지 않는다.
- 중복 행이 정합성을 깨뜨리는 곳만 UNIQUE와 원자 SQL로 보호한다.
- 저장 카운터를 두지 않아 원본과 카운터 사이의 stale data를 만들지 않는다.
- 여러 테이블 변경이 하나의 유스케이스인 경우에만 짧은 DB transaction을 사용한다.

### Jogak 실행

`(jogak_id, scheduled_date)` UNIQUE를 기준으로 insert 충돌을 처리한다. 동시 요청 중 하나가 생성에 성공하면 다른 요청은 현재 실행을 다시 읽고 동일한 상태 요청이면 성공으로 응답한다.

시작, 성공, 실패 API:

```http
POST /api/jogaks/{jogakId}/executions/{scheduledDate}/start
POST /api/jogaks/{jogakId}/executions/{scheduledDate}/success
POST /api/jogaks/{jogakId}/executions/{scheduledDate}/fail
```

- 실행을 새로 만들면 `201 Created`
- 기존 실행을 전이하거나 같은 상태를 재호출하면 `200 OK`
- 요청 날짜가 해당 Jogak 일정의 발생 건이 아니면 입력 오류

### 게시글 생성

기존 `POST /api/jogaks/{jogakId}/posts`와 요청의 `targetDate`는 유지한다.

해당 실행이 없으면 게시글과 같은 transaction에서 실행을 생성한다. 이미 게시글이 존재하면 `posts.jogak_execution_id` UNIQUE에 의해 중복 생성을 막는다.

### 좋아요와 팔로우

좋아요와 팔로우 생성은 복합 UNIQUE를 기준으로 원자 insert한다. 삭제는 소유 조합을 조건으로 직접 삭제한다. 게시글 자체를 잠그지 않는다.

### 인증 세션 회전

access JWT와 refresh JWT에는 session id를 포함하고 DB에는 refresh token hash만 저장한다. 재발급은 다음 조건을 포함한 단일 update로 회전한다.

- session id 일치
- 기존 token hash 일치
- 만료되지 않음

조건부 update가 성공한 요청만 새 token hash를 저장하고 토큰을 반환한다. 이미 사용한 refresh token의 재호출은 실패하므로 동시 재발급과 탈취 token 재사용을 막는다.

### 생성 개수 제한

- Modarat 하나당 Mogak 최대 8개
- Mogak 하나당 현재 또는 미래 일정이 남은 Jogak 최대 8개

이는 DB 불변식이 아니라 제품/UX 제한이다. 생성 전에 애플리케이션이 개수를 조회한다. 별도 slot 컬럼, CHECK, 비관적 락은 사용하지 않는다. 모바일은 요청 중 생성 버튼을 비활성화해 빠른 연속 탭을 막고, 극히 드문 동시 요청 경합은 허용한다.

### 예약 작업 재호출

DailyJogak 생성 배치는 제거한다. 향후 운영 예약 작업이 추가되면 대상의 자연 키나 별도 실행 키를 사용한 UNIQUE/조건부 update로 재호출을 멱등하게 만든다. 단순히 이전 실행 여부를 메모리에서만 확인하지 않는다.

## 11. 삭제와 데이터 생명주기

### 원칙

- soft delete를 사용하지 않는다.
- 사용자 데이터 익명화를 사용하지 않는다.
- 실제 제품에 없는 휴지통과 복구 API를 만들지 않는다.
- 명시적 삭제와 회원 탈퇴는 hard delete다.
- DB 복구는 애플리케이션 soft delete가 아니라 운영 백업 정책으로 처리한다.

### 명시적 리소스 삭제

- Modarat 삭제 -> 하위 Mogak, Jogak, 일정, 실행, 게시글, 이미지 메타데이터, 댓글, 좋아요 삭제
- Mogak 삭제 -> 하위 Jogak부터 같은 방식으로 삭제
- Jogak 삭제 -> 일정, 실행, 게시글과 하위 데이터 삭제
- Post 삭제 -> 이미지 메타데이터, 다른 사용자가 작성한 댓글과 좋아요도 함께 삭제
- Comment 삭제 -> 해당 댓글 행 삭제

반복을 멈추는 것은 삭제나 보관이 아니라 최신 일정의 `effective_to`를 닫는 것으로 처리한다.

### 회원 탈퇴

회원 탈퇴 시 다음 사용자 관련 데이터를 모두 hard delete한다.

- 인증 세션과 소셜 계정
- 사용자 동의 상태
- 프로필
- 양방향 팔로우 관계
- 다른 게시글에 남긴 좋아요와 댓글
- Modarat과 그 아래의 모든 Mogak, Jogak, 일정, 실행, 게시글 데이터

직업, 주소, 공식 카테고리, 동의 항목 정의 같은 공통 데이터는 유지한다.

DB 행 삭제는 FK `ON DELETE CASCADE`를 기본으로 하며 서비스의 수동 삭제 순서에 의존하지 않는다.

Storage object 삭제 방식은 Storage 분리 설계 때 확정한다. 현재 범위에서는 DB가 storage key만 소유하며, 향후 동기 삭제 또는 서버리스 정리 작업 중 어느 방식을 선택하더라도 재호출 가능한 멱등 삭제로 구현한다.

## 12. 카테고리

Mogak 카테고리는 공식 카테고리 또는 일회성 사용자 커스텀 값이다.

공식 카테고리 요청:

```json
{
  "categoryCode": "CERTIFICATION"
}
```

커스텀 카테고리 요청:

```json
{
  "customCategoryName": "코딩 테스트 준비"
}
```

중첩된 `category.type/code` 구조는 사용하지 않는다.

애플리케이션은 다음을 검증한다.

- 두 필드 중 정확히 하나만 존재
- 문자열 trim과 기존 API 길이 제한
- `categoryCode`가 활성 공식 카테고리인지 확인

커스텀 값은 해당 Mogak에만 저장한다. 같은 문자열을 자동으로 공식 카테고리와 연결하거나 재사용하지 않는다. 사용량이 쌓인 값은 운영자가 검토한 뒤 공식 카테고리 데이터로 추가할 수 있다.

카테고리는 Jogak과 실행에 복사하지 않는다.

## 13. 게시글과 피드

### 게시글

- 실행 하나당 게시글은 최대 하나다.
- 이미지는 없어도 게시글을 만들 수 있다.
- 게시글 수정은 contents를 변경한다.
- 게시글 삭제는 hard delete다.
- 좋아요 수와 댓글 수는 원본 행에서 집계한다.
- 조회 수 기능은 제거한다.
- 게시글 삭제와 실행 삭제의 방향은 다르다.
  - 게시글 삭제는 실행을 남긴다.
  - 실행 또는 Jogak 삭제는 게시글을 cascade 삭제한다.

### 이미지

- DB에는 `storage_key`만 저장한다.
- API에는 `StoragePort`가 생성한 URL을 반환한다.
- 공개 URL 또는 만료되는 signed URL 선택은 Storage 구현체 책임이다.
- 썸네일은 첫 이미지에서 파생한다.
- 프로필도 같은 원칙으로 `profile_image_key`를 저장하고 `profileImageUrl`을 응답한다.
- 실제 업로드 경로를 백엔드 multipart로 유지할지 서버리스로 분리할지는 후속 Storage 설계로 보류한다.

### 피드

다음 두 피드를 유지한다.

- 팔로잉 사용자 게시글 피드
- 지역 기반 네트워킹 피드

지역 피드에서 별도 필터가 없으면 인증 사용자의 거주지를 기본값으로 사용한다. 이 정책은 Application Service에 두어 향후 쉽게 변경할 수 있게 한다.

피드 조회는 posts, users, jobs, post_images 등 필요한 데이터를 조회 전용 쿼리로 조합한다. 모듈 간 직접 쓰기는 금지하지만 이런 읽기 전용 조인은 허용한다.

## 14. API 호환과 승인된 변경

### 기본 정책

- 현재 Spring Controller의 경로, 메서드, 요청, 응답과 BaseResponse envelope을 기본 계약으로 사용한다.
- 내부 테이블명이나 계층 구조를 API에 그대로 노출하지 않는다.
- iOS를 수정할 수 있다는 이유만으로 API를 임의 변경하지 않는다.
- 변경이 필요한 경우 API 변경표와 iOS 수정 위치를 구현 계획에 포함한다.

### 승인된 변경

#### DailyJogak 제거

- `dailyJogakId` 기반 시작, 성공, 실패 API를 `jogakId + scheduledDate` 기반 POST 명령으로 변경한다.
- Jogak 날짜별 조회 응답에서 `dailyJogakId`를 제거한다.
- 날짜별 발생 건은 `jogakId`, `scheduledDate`, 파생 또는 저장 상태로 식별한다.
- Post 응답에 있던 `dailyJogakId`도 제거하되 기존 `targetDate`는 유지한다.

#### 카테고리 요청

- 공식 카테고리는 `categoryCode`
- 커스텀 카테고리는 `customCategoryName`

#### 피드와 댓글 작성자

피드 게시글과 댓글 응답은 작성자를 중첩 구조로 반환한다.

```json
{
  "author": {
    "userId": 1,
    "nickname": "모각러",
    "profileImageUrl": "https://...",
    "job": "개발/데이터"
  }
}
```

기존의 평면 `userName`, `userJob` 필드는 이 구조로 교체한다.

#### 인증

- 임시 `POST /api/users/login` 제거
- Provider token을 검증하는 로그인만 허용
- 외부 token 필드명 `accessToken`, `refreshToken` 유지
- `RefreshToken` 요청 헤더 유지

기존 `POST /api/auth/login` Apple 경로와 `POST /api/auth/{provider}/login`은 초기 호환 경로로 유지한다.

#### 프로필 이미지

외부 프로필 API는 URL을 계속 반환한다. 변경되는 것은 DB 저장값이 전체 URL에서 storage key로 바뀌는 내부 구현뿐이다.

### 유지할 대표 API

- `POST /api/users/follows/{nickname}`
- `DELETE /api/users/follows/{nickname}`
- 기존 follow count, motos, mentors 경로
- `POST /api/jogaks/{jogakId}/posts`
- 기존 게시글 상세, 수정, 삭제, 댓글, 좋아요 경로
- 기존 직업, 주소, 카테고리 metadata 경로
- 기존 사용자 동의 API 경로

팔로우 대상은 UX상 nickname으로 입력받는다. 내부 `follows` 테이블만 user ID를 저장한다.

## 15. 인증과 세션

### 로그인

- 지원 공급자: Apple, Google, Kakao
- NestJS가 공급자 token을 검증한다.
- 검증된 공급자 사용자 ID로 `social_accounts`를 찾는다.
- 서비스 access token과 refresh token을 발급한다.
- Supabase Auth는 애플리케이션 사용자 기준으로 사용하지 않는다.

### token 정책

- access token: 15분
- refresh token: 31일
- clock skew: 현재와 같은 30초

### 동시 로그인

로그인할 때 기존 session을 덮어쓰지 않고 새 `auth_sessions` 행을 생성한다. 기기별 메타데이터, IP, User-Agent 저장은 초기 범위에 넣지 않는다.

- refresh: 해당 session의 token만 회전
- logout: access JWT의 session id로 현재 session만 hard delete
- withdrawal: 사용자의 모든 session cascade delete

### 소셜 계정 연결

- DB는 `users 1:N social_accounts`를 지원한다.
- 같은 이메일이라는 이유로 다른 공급자를 자동 연결하지 않는다.
- 다른 공급자의 이메일이 기존 사용자와 충돌하면 원래 공급자로 로그인하도록 안내한다.
- 명시적 계정 연결 API는 필요할 수 있지만 초기 구현 범위에서는 제외한다.

## 16. 제약과 인덱스 정책

### 초기 UNIQUE 제약

정합성에 필요한 다음 UNIQUE만 둔다.

- `users.nickname`
- `users.email`
- `consent_items.code`
- `user_consents(user_id, consent_item_id)`
- `social_accounts(provider, provider_user_id)`
- `social_accounts(user_id, provider)`
- `mogak_categories.code`
- `jogak_schedule_weekdays(schedule_id, weekday)`
- `jogak_executions(jogak_id, scheduled_date)`
- `posts.jogak_execution_id`
- `post_likes(post_id, user_id)`
- `follows(follower_id, following_id)`

### 넣지 않는 것

- CHECK 제약
- max 8 제한을 위한 slot, CHECK, UNIQUE
- soft delete partial unique
- 추측성 FK 인덱스
- 목록 정렬용 인덱스
- 사용 근거가 없는 복합 인덱스

성능 인덱스는 대표 데이터로 API 쿼리를 실행하고 `EXPLAIN ANALYZE`로 병목을 확인한 뒤 별도 migration으로 추가한다.

## 17. 오류 처리

- 입력 형식 또는 일정에 존재하지 않는 날짜: `400 Bad Request`
- 인증 실패: `401 Unauthorized`
- 소유권 또는 수정 권한 없음: `403 Forbidden`
- 대상 없음: `404 Not Found`
- 닉네임, 좋아요, 팔로우, 게시글 등 의미 있는 중복 충돌: `409 Conflict`
- 실행 상태의 동일 요청 재호출: 오류가 아니라 현재 상태를 반환

PostgreSQL UNIQUE 위반을 그대로 노출하지 않고 Application 오류로 변환한다. 응답에는 SQL, token, 공급자 원문 오류 같은 내부 정보를 포함하지 않는다.

## 18. 트랜잭션 경계

다음 작업은 하나의 짧은 DB transaction으로 처리한다.

- 사용자 생성 + 소셜 계정 + 동의 상태
- 일정 수정 시 이전 일정 종료 + 새 일정 생성 + 요일 저장
- 실행 최초 생성 + 상태 적용
- 실행이 없는 상태에서 텍스트 게시글 생성 시 실행 + 게시글

외부 OAuth와 Storage 네트워크 호출을 DB transaction 안에서 오래 유지하지 않는다. 외부 호출을 먼저 검증하고 DB transaction은 저장 구간에만 사용한다.

## 19. 테스트와 검증

### 단위 테스트

- ONCE/WEEKLY 날짜 발생 계산
- 일정 수정과 과거 실행 보존
- 파생 `PENDING`, `MISSED`
- 실행 상태 전이와 동일 요청 멱등성
- 카테고리 두 입력 중 하나만 허용하는 검증
- 소유권과 수정 권한

### PostgreSQL 통합 테스트

현재 `test:db`는 다음 Mogaks·Posts 정합성을 실제 PostgreSQL migration 이후 검증한다.

- 사용자 hard delete 후 Modarat → Mogak → Jogak → schedule → execution까지 FK cascade
- 같은 Jogak·날짜에 대한 동시 실행 생성 시 UNIQUE conflict 처리
- 실행 생성 뒤 Jogak 제목을 수정해도 실행 제목 snapshot 보존
- 사용자 hard delete 후 Post → 이미지 메타데이터·댓글·좋아요까지 FK cascade
- Post 직접 hard delete 시 이미지 메타데이터·댓글·좋아요만 cascade하고 실행은 보존
- 같은 실행에 대한 동시 게시글 생성 시 하나의 Post만 저장
- 같은 사용자의 동시 좋아요 생성 시 하나의 source row만 저장

실행 명령은 다음과 같다. 데이터베이스 이름이 `_test`로 끝나지 않으면 시작 전에 거부하므로, 운영·개발 DB에 migration을 적용하지 않는다.

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/mogak_test pnpm test:db
```

게시글·좋아요 DB 통합 테스트는 추가되었지만, 실제 통과 여부는 전용 PostgreSQL 서비스가 준비된 환경에서만 확인한다. 팔로우·refresh token·일정 수정의 DB 통합 테스트는 해당 모듈 구현 시 추가한다.

### API 계약 테스트

- 변경 승인을 받지 않은 Spring API 경로와 응답 envelope 유지
- DailyJogak 제거에 따른 변경 계약
- category 요청 변경
- 피드와 댓글의 중첩 author
- profile image URL 응답
- follow nickname 경로
- 지역 피드의 사용자 거주지 기본 필터
- 이미지 없는 게시글 생성

### 조회 성능 테스트

- 피드, Mogak 목록, Jogak 기간 조회, 댓글 목록의 SQL 수와 응답 시간을 측정한다.
- 목록 데이터 수가 늘어도 애플리케이션에서 N+1 쿼리를 만들지 않도록 검증한다.
- 결과를 근거로만 성능 인덱스를 추가한다.

## 20. 인프라 경계

### PostgreSQL

- 표준 PostgreSQL 연결 문자열과 Drizzle을 사용한다.
- Supabase Data API/PostgREST를 핵심 접근 경로로 사용하지 않는다.
- migration은 Drizzle Kit로 생성하고 Git에서 관리한다.
- Supavisor transaction pooling을 사용할 수 있으므로 세션 고정 기능에 의존하지 않는다.

### Storage

- Application은 `StoragePort`만 의존한다.
- Supabase Storage, S3 또는 이후 서버리스 구현을 교체할 수 있어야 한다.
- DB에는 object URL이 아닌 storage key를 저장한다.
- 실제 업로드와 object 삭제 실행 위치는 후속 Storage 설계에서 결정한다.

### Cloud Run

- 단일 NestJS 컨테이너로 시작한다.
- 런타임 `PORT`를 사용한다.
- health endpoint만 외부 운영 점검에 필요한 범위로 노출한다.
- 매칭되지 않은 보안 경로는 fail-closed로 처리한다.
- 핵심 비즈니스 로직을 Supabase Cron이나 Edge Function에 종속시키지 않는다.
- DailyJogak 생성용 Cloud Scheduler 작업은 만들지 않는다.

## 21. 구현 순서

1. NestJS 프로젝트 기반, 환경 설정, PostgreSQL/Drizzle, 공통 오류와 인증 컨텍스트
2. `users`와 `auth`: 프로필, 메타데이터, 동의, 소셜 계정, auth session
3. `mogaks`: Modarat, Mogak, 카테고리, Jogak, 일정과 가상 발생 건, 실행
4. `posts`: 게시글, 선택 이미지 메타데이터, 댓글, 좋아요
5. `social`: 팔로우, 팔로잉 피드, 지역 피드
6. API 계약 테스트와 iOS 변경표
7. Storage 구현 분리와 Cloud Run 배포 구성
8. 대표 데이터 성능 테스트 후 필요한 인덱스만 추가

각 단계는 기존 Spring 기능을 기준으로 계약 테스트를 만들고, 승인된 변경만 차이로 기록한다.

## 22. 제외 또는 후속 검토

초기 마이그레이션에서 제외한다.

- 기존 운영 데이터 이전
- Spring/NestJS 이중 쓰기
- 구·신 DB 동기화와 무중단 데이터 변환
- soft delete, 휴지통, 복구 API
- 익명화 보존
- `ARCHIVED` 상태
- Notice, Report, BlockUser
- 조회 수
- DailyJogak 선생성 배치
- Mogak 자동 성공/실패 판정 배치
- CQRS와 이벤트 버스
- 마이크로서비스 분리
- 명시적 소셜 계정 연결 API
- 동의 전체 변경 이력과 약관 버전 이력
- 기기/IP/User-Agent session 메타데이터
- 근거 없는 성능 인덱스

후속 Storage 설계에서만 결정한다.

- 백엔드 multipart 업로드 유지 여부
- signed upload URL 사용 여부
- 별도 서버리스 이미지 처리 여부
- 외부 object 삭제 재시도 실행 위치

## 23. 다음 작업

1. 전용 PostgreSQL 테스트 DB를 준비해 `test:db`를 통과시킨다.
2. Storage 구현과 배포 구성은 별도 결정 후 연결한다.
