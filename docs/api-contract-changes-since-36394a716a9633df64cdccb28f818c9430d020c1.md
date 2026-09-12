---
document_type: api-contract-changelog
audience: [frontend, llm]
comparison:
  from: 36394a716a9633df64cdccb28f818c9430d020c1
  to_branch: main
  to: 8f7f9c9221908f2532d12c5f0ab341ba71df3540
date: 2026-08-17
language: ko
---

# API 계약 변경사항 — 프런트엔드 전달용

## 한눈에 보기

이 비교 범위에서 프런트 수정이 필요한 계약 변경은 **2건**입니다.

| 우선순위 | 엔드포인트 | 변경 | 필요한 대응 |
| --- | --- | --- | --- |
| P0 | `POST /api/auth/:provider/login` | 가입 재개를 뜻하는 성공 코드 `AUTH_SIGNUP_RESUME_REQUIRED` 추가 | `200` 성공으로 처리하고 토큰 저장 후 가입 화면으로 이동 |
| P0 | `GET /api/posts/:postId` | `mogakId`, `jogakId`, `targetDate`가 `null` 가능 | 상세 모델·UI에서 세 필드를 nullable로 처리 |
| P1 | 모다라트/모각/조각 삭제 | 하위 계층 삭제 후에도 게시글 보존 | 삭제된 계층의 게시글 상세 화면을 처리 |

> **중요:** `AUTH_SIGNUP_RESUME_REQUIRED`는 HTTP 오류가 아닙니다. 응답은 `200 OK`이며 토큰도 정상 발급됩니다.

---

## 변경 1 — 소셜 로그인 가입 재개 코드

### 계약 요약

| 항목 | 값 |
| --- | --- |
| Endpoint | `POST /api/auth/:provider/login` |
| 지원 provider | `apple`, `google`, `kakao` |
| HTTP status | `200 OK` |
| 새 최상위 응답 코드 | `AUTH_SIGNUP_RESUME_REQUIRED` |
| 발생 조건 | 기존 소셜 계정이지만 가입 완료 전(`isRegistered: false`) 상태에서 다시 로그인한 경우 |
| 토큰 | 기존과 동일하게 `result.tokens`에 포함 |

### 응답 분기

| 조건 | HTTP | `code` | `result.isRegistered` | 프런트 처리 |
| --- | --- | --- | --- |
| 신규 가입 | `200` | `success` | `false` | 토큰 저장 → 가입 화면 |
| 가입 완료 사용자 로그인 | `200` | `success` | `true` | 토큰 저장 → 홈 |
| **중단된 가입 재개** | `200` | **`AUTH_SIGNUP_RESUME_REQUIRED`** | `false` | **토큰 저장 → 가입 화면 → 재개 안내 표시 가능** |
| 같은 이메일, 다른 소셜 계정 | `409` | `U012` | 없음 | 기존 계정 연결 안내. 토큰 없음 |

### 새 응답 예시

```json
{
  "time": "2026-08-17 18:00:00",
  "status": "OK",
  "code": "AUTH_SIGNUP_RESUME_REQUIRED",
  "message": "요청에 성공했습니다.",
  "result": {
    "isRegistered": false,
    "userId": 7,
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    }
  }
}
```

### 프런트 구현 기준

```ts
// `200` 응답을 받은 뒤의 분기 예시
saveTokens(response.result.tokens);

switch (response.code) {
  case 'AUTH_SIGNUP_RESUME_REQUIRED':
    navigateToSignup({ resumed: true });
    break;
  case 'success':
    navigate(response.result.isRegistered ? '/home' : '/signup');
    break;
}
```

### LLM 추출용 명세

```yaml
contract_delta:
  endpoint: POST /api/auth/:provider/login
  response:
    added_top_level_code:
      value: AUTH_SIGNUP_RESUME_REQUIRED
      http_status: 200
      result:
        isRegistered: false
        tokens: present
  client_rule: Treat as successful authentication; persist tokens before routing to signup.
  unchanged:
    - request body (`{ token: string }`)
    - result.userId
    - result.tokens.accessToken
    - result.tokens.refreshToken
```

---

## 변경 2 — 보존된 게시글 상세의 nullable 필드

### 계약 요약

| 항목 | 값 |
| --- | --- |
| Endpoint | `GET /api/posts/:postId` |
| 대상 | 삭제된 모다라트/모각/조각에 속했던 게시글 |
| 동작 | 게시글은 계속 `200 OK`로 조회 가능 |
| 영향 | 과거에는 항상 값이 있던 상위 계층 필드가 `null`일 수 있음 |

### 타입 변경

```ts
// GET /api/posts/:postId → result
type PostDetail = {
  postId: number;
  mogakId: number | null;      // 변경
  jogakId: number | null;      // 변경
  targetDate: string | null;   // 변경
  userId: number;
  contents: string;
  imgUrls: string[];
  commentId: number[];
  likeCnt: number;
  commentCnt: number;
};
```

### 응답 예시: 삭제된 계층의 게시글

```json
{
  "status": "OK",
  "code": "success",
  "result": {
    "postId": 31,
    "mogakId": null,
    "jogakId": null,
    "targetDate": null,
    "userId": 7,
    "contents": "남겨진 회고",
    "imgUrls": [],
    "commentId": [41],
    "likeCnt": 0,
    "commentCnt": 1
  }
}
```

### 프런트 구현 기준

- 세 필드를 non-null assertion(`!`)하거나 필수 경로 파라미터로 사용하지 않는다.
- 하나라도 `null`이면 모각/조각/날짜 링크를 숨긴다.
- 예: `삭제된 모각의 회고`라는 보조 문구를 표시한다.
- 본문·이미지·댓글·좋아요는 기존처럼 표시/동작한다.

### LLM 추출용 명세

```yaml
contract_delta:
  endpoint: GET /api/posts/:postId
  response.result:
    changed_nullable_fields:
      mogakId: number | null
      jogakId: number | null
      targetDate: string | null
  null_semantics: The post is retained, but its original mogak/jogak/execution hierarchy was deleted.
  client_rule: Render the post normally; do not render or follow hierarchy links when these fields are null.
```

---

## 동작 변경 — 계층 삭제 후 게시글 보존

### 대상 API

- `DELETE /api/modarats/:modaratId`
- `DELETE /api/mogaks/:mogakId`
- `DELETE /api/jogaks/:jogakId`

### 바뀐 동작

삭제 API의 HTTP 상태와 성공 응답 형식은 바뀌지 않았습니다. 다만 이제는 모다라트·모각·조각과 그 일정/실천 기록을 삭제해도 연결된 게시글은 삭제하지 않습니다.

```text
이전: 계층 삭제 → 게시글도 cascade 삭제
현재: 계층 삭제 → 게시글 보존 → 게시글 상세의 계층 관련 필드만 null
```

### 프런트 영향

- 보존된 게시글은 `GET /api/posts/:postId`로 계속 열 수 있습니다.
- 삭제된 `mogakId`를 이용한 `GET /api/mogaks/:mogakId/posts`는 사용할 수 없습니다.
- 삭제 직후 열려 있던 게시글 상세에서는 위 nullable 처리로 화면을 유지합니다.

---

## 명시적으로 변경되지 않은 계약

- 소셜 로그인 요청 body: `{ "token": string }`
- 소셜 로그인 `result` 객체 구조 및 토큰 필드명
- 로그인 이외 API의 공통 성공/오류 응답 형식
- 삭제 API의 HTTP status 및 성공 응답 형식

서버의 예외 요청 로그 강화는 내부 관측성 변경이며 프런트 응답 계약에는 영향이 없습니다.

## 프런트 반영 체크리스트

- [ ] 로그인 성공 코드 union에 `AUTH_SIGNUP_RESUME_REQUIRED` 추가
- [ ] 해당 코드도 오류가 아닌 `200` 성공으로 처리
- [ ] 가입 재개 코드일 때 토큰 저장 후 가입 화면으로 이동
- [ ] `PostDetail.mogakId`, `PostDetail.jogakId`, `PostDetail.targetDate`를 nullable로 변경
- [ ] 삭제된 계층의 게시글 상세 UI 및 링크 숨김 처리
