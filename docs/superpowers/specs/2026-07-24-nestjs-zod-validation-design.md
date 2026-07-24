# NestJS Zod 입력 검증 통합 설계

작성일: 2026-07-24  
상태: 승인됨 · 구현 계획 작성 전

## 목적

HTTP 입력 검증을 Zod로 일원화한다. 환경 설정에 이미 사용하는 Zod와 요청 DTO 검증 도구를 통일해, 런타임 검증 규칙과 TypeScript 타입이 한 스키마에서 나오도록 한다.

이 변경은 API의 경로, HTTP method, 요청 JSON 필드명, 성공 응답, 오류 envelope를 바꾸지 않는다. 잘못된 입력은 현재와 똑같이 HTTP 400 및 `Z005` (`입력값이 유효하지 않습니다`)로 응답한다.

## 현재 상태와 문제

- 환경 변수는 `src/config/app-env.ts`에서 Zod로 검증한다.
- HTTP Body·Query는 `class-validator`와 `class-transformer`, 전역 Nest `ValidationPipe`로 검증한다.
- Path Param은 컨트롤러마다 `asSafeId` 같은 수동 변환 함수로 검증한다.
- 게시글 multipart Body는 `request` 문자열을 JSON으로 파싱한 뒤 `plainToInstance` 및 `validateSync`로 별도 검증한다.
- 따라서 같은 개념의 입력 규칙이 데코레이터, 수동 함수, Zod로 나뉘며 타입 추론과 예외 정책도 흩어져 있다.

## 결정

### `nestjs-zod`를 기본 통합 계층으로 사용한다

`nestjs-zod`의 DTO 생성과 검증 Pipe를 사용한다. Zod와 Nest Controller의 연결을 직접 재구현하지 않고, 검증·타입 추론을 패키지의 안정된 경계에 맡긴다.

Swagger/OpenAPI 응답 직렬화, Swagger 정리, 응답 DTO 변환은 이번 범위에 넣지 않는다. 실제 API 문서 생성 요구가 생겼을 때만 해당 기능을 검토한다.

패키지 사용이 제약이 되거나 예외·multipart 요구를 충족하지 못하면, Zod 스키마는 그대로 유지한 채 내부 Pipe/어댑터로 교체한다. 컨트롤러가 패키지 고유 API에 과하게 묶이지 않도록 앱 소유의 작은 입력 어댑터를 둔다.

### 입력 어댑터 경계

공통 validation 영역은 다음 책임만 가진다.

- Zod DTO/스키마를 Nest의 Body·Query·Path Param에 연결한다.
- 패키지의 Zod 검증 실패를 `AppException(AppErrorCode.INVALID_PARAMETER)`로 바꾼다.
- Zod 오류 상세는 응답에 노출하지 않는다.
- 검증을 통과한 파싱 결과만 Controller에 전달한다.

Controller는 `@Body`, `@Query`, `@Param`을 직접 무검증으로 받지 않는다. Body·Query·Path Param 모두 명시적인 Zod DTO 또는 앱 소유 어댑터를 사용한다. `CurrentUser`, `UploadedFile(s)`, Response 객체는 HTTP 입력 DTO 대상이 아니므로 제외한다.

### 스키마 규칙

- 객체 요청은 모두 `.strict()`로 정의한다. 알 수 없는 필드는 현재 `forbidNonWhitelisted`와 동일하게 거절한다.
- JSON Body는 암묵적으로 숫자·불리언으로 바꾸지 않는다. 클라이언트가 올바른 JSON 타입을 보내야 한다.
- URL Query와 Path Param은 문자열로 도착하므로 필요한 값에 한해 `z.coerce`를 명시한다. 양의 안전 정수 ID는 `number`로 변환한 뒤 안전 정수·양수 조건을 검사한다.
- 선택값의 기본값과 최소값은 현재 DTO 계약을 보존한다. 예를 들어 페이지 Query의 `page` 기본값 `0`과 `size` 필수 조건을 유지한다.
- 날짜 문자열, 길이, enum, 중첩 배열, 상호 의존 필드는 기존 class-validator 규칙 및 서비스 규칙과 동등한 Zod 규칙으로 옮긴다.
- 서비스 소유권·존재 여부·상태 전이처럼 DB 조회가 필요한 규칙은 Zod가 아니라 기존 Application Service가 계속 검증한다.

### multipart 게시글 어댑터

파일 업로드는 Express 기반 Nest의 기존 Multer `FilesInterceptor`를 유지한다. Multer는 `multipart/form-data` 파싱, 파일 개수·크기·MIME 타입 제한만 담당한다.

게시글 생성의 text field `request`는 앱 소유 multipart 어댑터가 다음 순서로 처리한다.

1. `request`가 문자열인지 확인한다.
2. JSON을 파싱한다. 파싱 실패는 `Z005`로 처리한다.
3. 게시글 생성 Zod 스키마로 검증한다.
4. 검증된 값을 Controller에 전달한다.

파일이 없는 JSON 요청과 빈 파일 허용, 실제 Storage 비활성 시 `Z006` 처리, 이미지 제한은 기존 계약을 그대로 유지한다.

## 변경 범위

### 공통 계층

- `nestjs-zod` 의존성을 추가한다.
- 패키지의 검증 예외를 `Z005`로 매핑하는 전역 Pipe/예외 어댑터를 추가한다.
- 기존 전역 Nest `ValidationPipe`를 제거한다.
- 정수 ID, 날짜, 페이지 등 여러 모듈이 공유하는 규칙은 공통 Zod 스키마 헬퍼로 둔다. 도메인별 스키마는 각 모듈 presentation에 둔다.

### Controller

- `auth`, `users`, `mogaks`, `posts`, `social`의 모든 Body·Query·Path Param DTO를 Zod 스키마와 추론 타입으로 교체한다.
- 수동 `asSafeId` 변환과 class-validator DTO 데코레이터를 제거한다.
- 게시글 생성은 multipart Zod 어댑터로 교체한다.
- 현재 서비스 호출 인자와 HTTP 경로는 유지한다.

### 의존성 정리

모든 요청 DTO 전환이 끝난 뒤 `class-validator`, `class-transformer`를 `package.json`과 lockfile에서 제거한다. 다른 런타임 코드가 두 패키지를 참조하지 않는지 검사한다.

## 오류 및 호환성 정책

| 상황 | 결과 |
| --- | --- |
| Body·Query·Path Param 타입/형식/범위 오류 | HTTP 400, `Z005` |
| 객체에 정의되지 않은 필드 포함 | HTTP 400, `Z005` |
| multipart `request` 누락 또는 JSON 파싱 실패 | HTTP 400, `Z005` |
| Multer 파일 제한 위반 | 기존 전역 예외 filter를 통한 HTTP 400, `Z005` |
| Storage 비활성 상태에서 실제 파일 업로드 | 기존 HTTP 503, `Z006` |
| DB 기반 도메인 검증 실패 | 현재 도메인별 오류 코드 유지 |

Zod 오류의 path, 내부 메시지, 스택은 클라이언트 응답에 추가하지 않는다. 로그 정책은 이번 범위에서 변경하지 않는다.

## 테스트 및 완료 기준

- 공통 Pipe/어댑터는 정상 파싱, 타입 오류, 알 수 없는 필드, 정수 coercion, `Z005` 매핑을 단위 테스트한다.
- multipart 어댑터는 정상 JSON, 누락, 손상 JSON, 알 수 없는 필드를 단위·HTTP 계약 테스트한다.
- 각 Controller의 Body·Query·Path Param 대표 경로에 대해 기존 성공 응답과 `Z005` 오류 envelope를 HTTP 테스트로 고정한다.
- 테스트 이름은 기존 규칙대로 한글 문장형으로 작성한다.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test --runInBand`, `pnpm test:e2e --runInBand`, `pnpm test:db --runInBand`를 통과해야 한다.

## 비목표

- API 경로·HTTP method·응답 DTO 변경
- Swagger/OpenAPI 응답 직렬화 도입
- Validation 오류 상세 응답 추가
- 도메인·DB 규칙을 HTTP 스키마 계층으로 이동
- Multer 또는 Storage 구현 교체
