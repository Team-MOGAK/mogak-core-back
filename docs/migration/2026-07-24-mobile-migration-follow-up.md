# NestJS 전환에 따른 모바일 앱 팔로업

작성일: 2026-07-24
대상: 기존 Spring API를 사용하던 iOS 앱

## 1. 목적과 범위

이 문서는 NestJS 전환으로 인해 앱에서 바꾸거나 확인해야 하는 **공개 API 계약**을 정리한다. 백엔드의 Drizzle, 모듈 구조, 테이블·세션 저장 방식처럼 앱에 보이지 않는 내부 변경은 다루지 않는다.

기준 문서는 [NestJS 마이그레이션 설계 및 인수인계](./2026-07-23-nestjs-migration-handoff.md)다. 이 문서는 앱 작업용 변경표와 출시 점검표이며, API를 새로 설계하는 문서가 아니다.

## 2. 공통 통신 규칙

- 응답은 기존 `BaseResponse` 형태를 유지한다. 앱은 실제 데이터만 `result`에서 읽는다.

  ```json
  {
    "time": "2026-07-24 10:30:00",
    "status": "OK",
    "code": "success",
    "message": "요청에 성공했습니다.",
    "result": {}
  }
  ```

- 가입 완료 사용자 전용 API에는 `Authorization: Bearer <accessToken>`을 보낸다. 로그인 직후 `isRegistered: false`인 사용자는 가입 API 이외의 사용자 기능을 호출하지 않는다.
- 모든 Body·Query·Path Parameter는 엄격하게 검증된다. 정의되지 않은 필드, 잘못된 타입, 빈 필수 문자열은 `400 / Z005`다. 앱 모델이나 요청 DTO에서 예전 필드를 함께 보내지 않는다.
- 날짜는 시간·타임존 문자열이 아닌 `YYYY-MM-DD` 형식만 보낸다. 조각의 오늘 상태와 날짜별 발생 건의 기준은 KST다. 앱에서도 선택한 날짜를 KST 기준 날짜 문자열로 변환한다.
- 네이티브 앱은 CORS 설정 대상이 아니다. 웹 클라이언트를 추가할 때만 서버의 허용 Origin에 배포 도메인을 추가한다.

## 3. 인증·가입·세션

### 3.1 로그인 전환표

`POST /api/users/login`은 제거됐다. 이메일을 보내 JWT를 발급받는 흐름을 삭제하고, 각 네이티브 SDK가 발급한 공급자 토큰을 아래 API로 전달한다.

| 공급자 | 앱이 얻어야 하는 값 | 요청 |
| --- | --- | --- |
| Apple | Apple native `identityToken` | `POST /api/auth/login` body: `{ "id_token": "..." }` |
| Google | Google native **ID token** | `POST /api/auth/google/login` body: `{ "token": "..." }` |
| Kakao | Kakao native **access token** | `POST /api/auth/kakao/login` body: `{ "token": "..." }` |

- Google access token을 ID token 자리에 보내거나, Kakao ID token을 access token 자리에 보내면 검증에 실패한다.
- 공급자 토큰은 서비스 토큰과 다르다. Apple·Google·Kakao 토큰을 앱 저장소에 서비스 세션처럼 보관하거나 이후 API의 Bearer 토큰으로 사용하지 않는다.
- 앱은 실제 배포 전에 Apple·Google·Kakao SDK로 받은 토큰을 staging 서버에 한 번씩 연결해 확인한다. 서버의 각 OAuth client ID 설정과 앱 번들 ID·OAuth 설정이 일치해야 한다.

로그인 성공 `result`는 다음 형태다.

```json
{
  "isRegistered": false,
  "userId": 1,
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

앱 처리 순서:

1. `tokens.accessToken`, `tokens.refreshToken`을 Keychain 등 OS 보안 저장소에 저장한다.
2. `isRegistered: true`면 홈으로, `false`면 가입 화면으로 이동한다.
3. `false` 상태에서는 `POST /api/users/join`만으로 가입을 완료한다. 가입 요청에도 방금 받은 access token을 `Authorization` 헤더로 보낸다.
4. 가입 응답도 새 `tokens`를 돌려주므로, **기존 두 토큰을 모두 새 값으로 원자적으로 교체**한 뒤 홈으로 이동한다. 이전 `PENDING` 세션의 access token은 더 이상 사용하지 않는다.

가입 전에 다음 공개 메타데이터를 읽어 선택 UI를 구성한다.

- `GET /api/metadata/jobs`
- `GET /api/metadata/addresses`
- `GET /api/consents`

가입 요청은 다음과 같다.

```json
POST /api/users/join
Authorization: Bearer <accessToken>

{
  "nickname": "모각러",
  "job": "개발/데이터",
  "address": "서울특별시",
  "consents": [{ "consentItemId": 1, "agreed": true }]
}
```

닉네임 중복 확인은 `POST /api/users/nickname/verify` body `{ "nickname": "..." }`다. 화면에서 빠르게 반복 호출하지 않도록 입력 중에는 debounce를 적용한다. 서버도 분당 30회 제한을 둔다.

### 3.2 토큰 갱신과 동시 로그인

- access token 만료 시 `POST /api/auth/refresh`를 호출하고 body가 아니라 `RefreshToken: <refreshToken>` 헤더로 refresh token을 보낸다.
- 성공 응답은 새 `{ accessToken, refreshToken }`다. refresh token은 회전하므로 두 토큰을 함께 교체한다.
- 한 기기에서 만료 요청이 여러 개 동시에 나갈 수 있다. 앱 네트워크 계층에서 refresh 호출은 한 번만 수행하고, 대기 중이던 원래 요청은 새 access token으로 한 번 재시도한다. 같은 refresh token을 병렬로 사용하면 한 요청만 성공할 수 있다.
- refresh 실패(`T001`, `T002`, `T003`, `T005`) 또는 재시도도 실패한 경우, 저장된 두 토큰을 지우고 로그인 화면으로 이동한다.
- 여러 기기 로그인은 허용한다. `POST /api/auth/logout`은 현재 access token이 가리키는 **현재 기기 세션만** 종료한다. 성공 여부와 관계없이 앱은 로컬 토큰을 제거한다.
- `POST /api/auth/withdraw`는 회원과 연결 데이터를 hard delete한다. 성공 응답 `result.isDeleted`가 `true`면 로컬 토큰과 사용자 캐시·이미지 캐시를 모두 지우고 온보딩으로 이동한다. 다시 사용하려면 소셜 로그인부터 새로 시작한다.

## 4. Modarat·Mogak 카테고리

Modarat, Mogak, Jogak은 서로 다른 화면 개념이지만 모두 `mogaks` 기능 범위다. 앱의 메뉴나 도메인 모델을 합칠 필요는 없다.

### 카테고리 요청

공식 카테고리와 사용자 입력 카테고리는 중첩 객체가 아니라 아래 두 필드 중 **정확히 하나**로 보낸다.

```json
{ "categoryCode": "CERTIFICATION" }
```

```json
{ "customCategoryName": "코딩 테스트" }
```

- 둘 다 보내거나 둘 다 생략하면 `400 / Z005`다.
- 공식 선택지는 `GET /api/metadata/mogak-categories`의 `result[].code`를 그대로 사용한다. 화면에 하드코딩하지 않는다.
- 응답은 다음처럼 항상 중첩 `category`로 읽는다. 커스텀 카테고리일 때 `category.code`는 `null`이다.

  ```json
  { "category": { "code": "CERTIFICATION", "name": "자격증" } }
  ```

## 5. DailyJogak 제거와 날짜별 실행

서버는 매일 `DailyJogak` 행을 미리 만들지 않는다. 날짜별 화면은 Jogak 일정과 `scheduledDate`로 계산한 발생 건을 사용한다.

| 기존 처리 | NestJS 전환 후 앱 처리 |
| --- | --- |
| `dailyJogakId`를 목록 행·실행·게시글 식별자로 보관 | `jogakId + scheduledDate`를 발생 건의 식별자로 보관 |
| DailyJogak 생성 배치 결과를 기다림 | 날짜 조회 시 즉시 일정에서 발생 건을 표시 |
| `dailyJogakId`로 시작·성공·실패 | 아래 POST 명령 API를 호출 |

날짜별 목록에서 사용하는 필드는 최소 다음과 같다.

```json
{
  "jogakId": 10,
  "scheduledDate": "2026-07-24",
  "title": "알고리즘 1문제",
  "status": "TODO",
  "isRoutine": true,
  "achievements": 3
}
```

- `GET /api/jogaks?date=YYYY-MM-DD`: 해당 날짜의 모든 발생 건
- `GET /api/jogaks/daily?date=YYYY-MM-DD`: 일회성 Jogak만
- `GET /api/jogaks/routines?startDay=YYYY-MM-DD&endDay=YYYY-MM-DD`: 반복 Jogak 범위
- `GET /api/mogaks/{mogakId}/jogaks?date=YYYY-MM-DD`: 특정 Mogak의 해당 날짜 발생 건

실행 명령은 다음과 같다.

```text
POST /api/jogaks/{jogakId}/executions/{scheduledDate}/start
POST /api/jogaks/{jogakId}/executions/{scheduledDate}/success
POST /api/jogaks/{jogakId}/executions/{scheduledDate}/fail
```

- 버튼을 연속 탭해 같은 명령이 재호출돼도 같은 상태면 성공 응답을 반환한다. 화면은 버튼을 요청 중 비활성화하고 응답의 `status`로 갱신한다.
- `start` 후 `success` 또는 `fail`로 변경할 수 있다. 완료·실패 상태에서 `start`로 되돌릴 수 없으며 `400 / M003`이다.
- 최초 상태 명령은 `201 Created`, 이미 존재한 실행 상태의 처리 결과는 `200 OK`일 수 있다. 둘 다 정상 처리한다.
- 실행 API 응답의 `executionId`는 서버 내부 실행 행의 식별자일 뿐, 앱의 목록·게시글 연결 키를 `dailyJogakId`처럼 바꾸라는 뜻이 아니다. 앱 상태와 요청에는 계속 `jogakId + scheduledDate`를 사용한다.

게시글도 `dailyJogakId` 없이 생성한다.

```text
POST /api/jogaks/{jogakId}/posts
```

multipart 요청의 JSON에는 기존처럼 `targetDate`를 넣으며, 이 값은 해당 발생 건의 `scheduledDate`와 같아야 한다.

```json
{ "targetDate": "2026-07-24", "contents": "오늘의 회고" }
```

## 6. 피드·댓글 작성자 모델

피드와 댓글의 작성자 정보는 평면 필드가 아니라 `author`로 읽는다.

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

- 예전 `userName`, `userJob` 등 평면 필드는 제거한다. 화면 모델과 디코더를 `author.nickname`, `author.job`, `author.profileImageUrl`로 바꾼다.
- 팔로우 API는 기존처럼 nickname을 URL에 사용한다. 피드의 `author.userId`는 표시·식별용 정보이고, 팔로우 요청을 ID 기반으로 바꾸지 않는다.

  ```text
  POST   /api/users/follows/{nickname}
  DELETE /api/users/follows/{nickname}
  ```

- 지역 피드 `GET /api/posts`는 `address` query가 없으면 로그인 사용자의 거주지를 기본으로 사용한다. 필터를 선택했을 때만 `address`를 보낸다. `sort`는 `createdAt` 또는 `likeCnt`다.

## 7. 프로필·게시글 이미지

프로필 조회와 피드 작성자 응답의 이미지 값은 계속 URL(`imgUrl`, `author.profileImageUrl`)이다. 앱이 storage key를 다룰 필요는 없다.

단, 현재 서버 Storage 구현은 의도적으로 비활성 상태다.

- 프로필 이미지 변경 `PUT /api/users/profile/image`과 이미지를 첨부한 게시글 작성은 `503 / Z006`을 받는다.
- 이미지 없는 게시글 작성은 정상 동작한다.
- 앱 배포 시점에 Storage가 아직 연결되지 않았다면 프로필 이미지 변경·게시글 이미지 첨부 UI를 숨기거나 비활성화한다. Z006을 일반 오류로 재시도하지 않고 “이미지 기능 준비 중”으로 안내한다.
- Storage 연결 후에는 multipart field name `multipartFile`, 파일당 5 MiB, JPEG/PNG/WebP, 게시글 최대 5장을 지킨다. 그 전까지 이미지 전송 회귀 테스트는 제외한다.

## 8. 오류 처리와 출시 전 확인

### 앱 공통 처리

| 조건 | 앱 처리 |
| --- | --- |
| `Z005` 입력값 오류 | 기존 요청을 그대로 반복하지 말고 해당 입력을 수정하게 안내 |
| `Z006` Storage 비활성 | 이미지 기능만 비활성·안내; 로그인이나 텍스트 게시글로 전체 로그아웃하지 않음 |
| `Z007` 요청 제한 | 짧은 재시도 대기 또는 입력 반복 방지; 로그인·refresh·닉네임 확인에 특히 적용 |
| `T001`, `T002`, `T003`, `T005` 인증 오류 | refresh가 가능한 경우 단일 갱신 후 1회 재시도, 그 외에는 로컬 세션 제거 후 로그인 |
| `M003` 실행 상태 전이 오류 | 날짜별 목록을 다시 조회해 서버 상태로 UI를 복구 |

### 배포 전 앱 QA 체크리스트

- [ ] Apple, Google, Kakao 각각의 실제 네이티브 로그인 토큰으로 로그인한다.
- [ ] 신규 로그인은 가입 화면으로, 기존 사용자는 홈으로 이동한다.
- [ ] 가입 완료 응답의 새 토큰으로 교체한 뒤 프로필·모각 API가 동작한다.
- [ ] access token 만료 상태에서 병렬 API 요청을 발생시켜 refresh가 한 번만 호출되고 대기 요청이 복구되는지 확인한다.
- [ ] 로그아웃 뒤 같은 access token으로 보호 API가 실패하고, 앱 저장소가 비워지는지 확인한다.
- [ ] 탈퇴 뒤 로그인 화면으로 돌아가며 사용자 캐시가 남지 않는지 확인한다.
- [ ] 날짜별 조각 화면과 게시글 작성에 `dailyJogakId`가 남아 있지 않고 `jogakId + scheduledDate`만 사용하는지 확인한다.
- [ ] 시작·성공·실패 버튼을 빠르게 두 번 눌러도 화면이 중복 생성·오류 상태가 되지 않는지 확인한다.
- [ ] 공식·커스텀 카테고리를 각각 생성하고, 두 값을 동시에 보내지 않는지 확인한다.
- [ ] 피드·댓글의 작성자 표시에 `author` 객체를 사용하는지, 닉네임 기반 팔로우가 유지되는지 확인한다.
- [ ] Storage가 비활성인 환경에서는 이미지 UI가 노출되지 않거나 Z006 안내가 표시되는지 확인한다.

## 9. 백엔드에 전달할 확인 항목

앱은 API 계약 변경이 필요할 때 다음 정보를 백엔드에 함께 요청한다.

1. 변경하려는 화면과 사용자 흐름
2. 기존 요청·응답 예시와 필요한 새 예시
3. 구 버전 앱과의 공존 기간
4. 예상 배포 순서와 롤백 방법

`userId`를 팔로우 경로로 바꾸거나, `dailyJogakId`를 다시 도입하거나, 이미지 업로드 실패를 다른 API 계약으로 우회하는 변경은 이 문서를 갱신하고 합의한 뒤 진행한다.
