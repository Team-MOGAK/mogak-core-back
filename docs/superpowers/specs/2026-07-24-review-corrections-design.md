# Nest 마이그레이션 리뷰 보완 설계

## 목적

`main..codex/nestjs-foundation`의 마이그레이션 구현을 기존 Spring 코드와 공개 이슈 기준으로 재검토해 확인한 계약·정합성 결함을 보완한다. 브라우저 지원은 현재 주 대상이 아니지만, 명시된 허용 origin만 처리하는 최소 CORS 구성도 함께 둔다.

## 이슈 및 기존 계약 재확인

- [#140 ERD 및 삭제/연관관계 재설계](https://github.com/Team-MOGAK/MOGAK_Spring/issues/140): Nest의 FK cascade hard delete와 원본 행 기반 관계는 유지한다. 새 soft delete, 익명화, 보관함은 추가하지 않는다.
- [#165 이미지 없이 회고 생성](https://github.com/Team-MOGAK/MOGAK_Spring/issues/165): 이미지 없는 게시글 생성과 비활성 StoragePort의 fail-fast 경계는 이미 구현된 정책을 유지한다.
- [#167 API URL 정리](https://github.com/Team-MOGAK/MOGAK_Spring/issues/167): 확정된 Nest URL 계약은 바꾸지 않는다. 다만 Spring `SecurityConfig`의 역할 경계는 API 계약의 일부로 복원한다. `PENDING`은 `POST /api/users/join`만, 일반 `/api/**` 기능은 `USER`만 사용한다.
- [#169 메타데이터 API](https://github.com/Team-MOGAK/MOGAK_Spring/issues/169), [#172 사용자 동의](https://github.com/Team-MOGAK/MOGAK_Spring/issues/172): 현재 서버 메타데이터와 동의 모델은 유지한다.
- [#174 인덱스 적용 기준](https://github.com/Team-MOGAK/MOGAK_Spring/issues/174): 성능 인덱스를 새로 만들지 않는다. 이번 보완에도 lock, CHECK 제약, 추측성 index를 추가하지 않는다.

## 결정

### 1. 가입 상태 권한 경계

`AccessTokenGuard`는 토큰·세션 검증과 현재 사용자 주입만 계속 담당한다. 별도 `RegisteredUserGuard`가 `request.user.role === 'USER'`를 확인한다.

- `Mogaks`, `Posts`, `Social`의 보호 API에는 두 Guard를 함께 적용한다.
- 사용자 프로필·직업·이미지·동의 변경 API에도 두 Guard를 적용한다.
- `POST /api/users/join`은 `AccessTokenGuard`만 적용하고 기존 서비스의 `PENDING` 확인을 유지한다.
- 로그아웃·탈퇴는 가입 상태와 무관한 세션 소유자 동작이므로 `AccessTokenGuard`만 적용한다.
- public metadata, consent 목록, nickname 확인, social login·refresh는 기존처럼 public이다.

이 변경은 응답 payload나 URL을 바꾸지 않으며, 미가입 토큰으로 회원 전용 API를 호출하면 기존 오류 envelope의 `403 Forbidden`을 반환한다.

### 2. Google ID token issuer 호환

Google 검증기는 `https://accounts.google.com`과 `accounts.google.com`을 모두 issuer로 허용한다. 서명, audience, 만료 시간, RS256 제한은 그대로 유지한다. Google이 두 issuer를 모두 유효하다고 정의하므로, issuer 배열만 넓히고 다른 검증을 완화하지 않는다.

### 3. Jogak 일정 버전의 비중첩 보장

일정 교체는 현재 또는 과거 구간을 보존하고, 새 일정과 이미 예약된 후속 일정이 겹치지 않게 한다.

1. 같은 Jogak의 새 `effectiveFrom`을 포함하는 현재 일정과, 그 이후 가장 이른 후속 일정을 같은 짧은 transaction에서 조회한다.
2. 현재 일정이 있으면 새 일정 전날로 종료한다.
3. 후속 일정이 없으면 요청한 `effectiveTo`를 그대로 저장한다.
4. 후속 일정이 있으면 요청 `effectiveTo`가 후속 시작일 이후인 경우 입력 오류로 거부한다. 종료일을 생략한 요청은 후속 시작일 전날을 종료일로 저장한다.
5. 새 일정과 후속 일정의 요일·기간은 수정하지 않는다. 이미 생성된 execution과 제목 snapshot도 수정하지 않는다.

이 규칙은 미래 일정을 예약한 뒤 현재 일정만 다시 수정해도 같은 날짜의 가상 발생 건이 중복되는 일을 막는다. 정상 클라이언트의 연속 수정은 기존 정책대로 직렬화한다고 가정하며, 비관적 락과 새 DB 제약은 도입하지 않는다.

### 4. 실행 응답과 입력 정규화

- 실행 명령은 해당 날짜를 만족한 일정의 `scheduleType`을 응답 변환에 전달해 `isRoutine`을 `WEEKLY`일 때만 `true`로 반환한다.
- 제목·닉네임·직업·주소와 필수 Modarat 색상처럼 공백을 저장하면 안 되는 필수 문자열은 trim 후 빈 값이면 `INVALID_PARAMETER`으로 거부한다. 선택 custom category와 Mogak color는 현재의 optional trim 정책을 유지한다.
- HTTP DTO에도 공백 불가 검증을 추가하되, application service에서 동일하게 검증해 controller를 우회한 호출도 막는다.

### 5. 최소 CORS 구성

`CORS_ALLOWED_ORIGINS`를 선택 환경 변수로 추가한다.

- 값은 쉼표 구분의 완전한 origin 목록이며, URL path·wildcard는 허용하지 않는다.
- 빈 값 또는 미설정이면 CORS를 활성화하지 않는다. 현재 iOS 앱 동작에는 영향이 없다.
- 값이 있으면 지정된 origin, `GET/POST/PUT/PATCH/DELETE`, `Authorization`·`Content-Type`·`RefreshToken` 헤더만 허용한다.
- bearer token 헤더 인증이므로 `credentials`는 활성화하지 않는다.

## 테스트 및 검증

각 수정은 구현 전에 실패 테스트를 추가한다.

- PENDING 토큰은 가입 외 보호 API에서 403을 받고 USER 토큰은 기존 API를 계속 사용할 수 있다.
- Google legacy issuer 토큰은 검증되고, 다른 issuer는 계속 거부된다.
- 미래 후속 일정이 있는 상태에서 현재 일정을 수정해도 일정 기간이 겹치지 않고, 해당 날짜별 occurrence는 하나만 반환된다.
- ONCE 실행 응답의 `isRoutine`은 false이고 WEEKLY는 true다.
- 공백 전용 Modarat·Mogak·Jogak 제목과 nickname이 400으로 거부된다.
- 설정된 origin에는 정확한 CORS header가, 미설정·미허용 origin에는 허용 header가 없다.

최종적으로 `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `env -u DATABASE_URL pnpm test:db`를 실행한다.

## 범위 밖

- API URL 또는 BaseResponse 변경
- 실제 Storage 구현과 외부 파일 정리 보상 작업
- 브라우저 클라이언트 개발 또는 CORS wildcard·cookie 인증
- 신규 성능 index, CHECK 제약, 비관적 lock
- 소셜 계정 연결 기능, 동의 이력, 일정 상태 이력
