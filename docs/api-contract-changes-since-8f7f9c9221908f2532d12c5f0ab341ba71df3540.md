---
document_type: api-contract-changelog
audience: [frontend, llm]
comparison:
  from: 8f7f9c9221908f2532d12c5f0ab341ba71df3540
  to_branch: main
  to: b2a83b6fa7373a3a73248349638765b0f3b138f2
date: 2026-08-24
language: ko
---

# API 계약 변경사항 — 프런트엔드 전달용

## 한눈에 보기

기준 커밋 `8f7f9c9` 이후 프런트엔드 수정이 필요한 공개 API 계약 변경은 아래 다섯 가지입니다. 가장 먼저 수정 API 호출부의 HTTP 메서드와 `Content-Type`을 바꿔야 합니다. 기존 `PUT` 호출은 더 이상 동작하지 않습니다.

| 우선순위 | 영역 | 변경 | 프런트 작업 |
| --- | --- | --- | --- |
| P0 | 모다랏·모각·조각 수정 | `PUT`에서 `PATCH`로 전환 | URL 호출 메서드를 전환하고 부분 수정 요청만 전송 |
| P0 | 수정 API 공통 | JSON Merge Patch 전용 미디어 타입 요구 | `Content-Type: application/merge-patch+json` 설정 |
| P0 | 모각 카테고리 수정 | 평면 필드에서 `category` tagged union으로 변경 | 수정 요청 모델과 직렬화 변경 |
| P1 | 조각 일정 수정 | `effectiveFrom` 제거, 현재 일정 기준 수정 | 일정 편집 UI·요청 모델 변경 |
| P1 | 회원 탈퇴 | `201` + JSON 본문에서 `204 No Content`로 변경 | 본문 파싱 제거 후 세션·캐시 초기화 |

> **중요:** 아래 수정 API에서 일반 `application/json`을 보내면 요청 본문과 무관하게 `415 / Z007`입니다. Axios 등에서 기본 `Content-Type`을 쓰고 있다면 공통 PATCH 래퍼부터 바꾸세요.

---

## 1. 수정 API 공통: JSON Merge Patch

### 변경된 엔드포인트

| 기존 | 변경 | 필수 요청 헤더 |
| --- | --- | --- |
| `PUT /api/modarats/:modaratId` | `PATCH /api/modarats/:modaratId` | `Content-Type: application/merge-patch+json` |
| `PUT /api/mogaks/:mogakId` | `PATCH /api/mogaks/:mogakId` | `Content-Type: application/merge-patch+json` |
| `PUT /api/jogaks/:jogakId` | `PATCH /api/jogaks/:jogakId` | `Content-Type: application/merge-patch+json` |
| `PATCH /api/users/marketing-consent` | 동일 | `Content-Type: application/merge-patch+json` |

성공 응답에는 서버가 지원하는 수정 형식을 나타내는 헤더가 포함됩니다.

```http
Accept-Patch: application/merge-patch+json
```

브라우저 CORS 응답에서도 이 헤더를 읽을 수 있습니다. 다만 프런트가 이 값을 매번 확인할 필요는 없고, 위 네 API 호출에 고정 헤더를 적용하면 됩니다.

### 요청 작성 규칙

- 바꾸는 필드만 보낸다. 보내지 않은 필드는 유지된다.
- 빈 객체 `{}` 는 허용하지 않는다. 각 엔드포인트가 요구하는 수정 가능 필드 중 하나 이상을 포함해야 한다.
- `null`로 값을 삭제하는 방식은 지원하지 않는다. `null`을 보내면 검증 오류 `400 / Z005`가 반환될 수 있다.
- 정의되지 않은 필드, 잘못된 타입, 이전 요청 모델의 필드는 `400 / Z005`다.
- 기존 `PUT` 엔드포인트는 제거되어 `404`다.

### 공통 호출 예시

```ts
const mergePatch = <T>(url: string, body: T) =>
  api.patch(url, body, {
    headers: {
      'Content-Type': 'application/merge-patch+json',
    },
  });
```

`Application/Merge-Patch+Json; charset=utf-8`처럼 대소문자 또는 charset이 포함된 표현도 서버에서 허용한다. 새 코드에서는 일관되게 소문자 canonical 값인 `application/merge-patch+json`을 사용한다.

### 오류 처리

| 상황 | HTTP | 오류 코드 | 프런트 처리 |
| --- | --- | --- | --- |
| `Content-Type` 누락 또는 일반 JSON | `415` | `Z007` | 요청 래퍼/헤더 설정 오류로 보고 재시도하지 않음 |
| 빈 PATCH, 잘못된 필드·타입 | `400` | `Z005` | 화면 입력 또는 요청 모델 수정 |
| 삭제된 기존 `PUT` 경로 호출 | `404` | `Z003` | 호출 메서드·경로를 PATCH로 교체 |

---

## 2. 모다랏 수정

### 계약

```http
PATCH /api/modarats/:modaratId
Content-Type: application/merge-patch+json
```

수정 가능한 필드는 `title`, `color`다. 둘 중 하나 이상만 전송하면 된다.

```json
{
  "color": "#475FFD"
}
```

기존에는 수정 시 `title`과 `color`를 모두 전송해야 했다. 이제 화면에서 색상만 바꾸는 경우 제목을 다시 보낼 필요가 없다.

---

## 3. 모각 수정: 카테고리 입력 구조 변경

### 계약

```http
PATCH /api/mogaks/:mogakId
Content-Type: application/merge-patch+json
```

수정 가능한 필드는 `title`, `color`, `category`다. 하나 이상을 전송한다.

### 카테고리 변경 요청

공식 카테고리는 다음처럼 보낸다.

```json
{
  "category": {
    "type": "SYSTEM",
    "code": "CERTIFICATION"
  }
}
```

사용자 입력 카테고리는 다음처럼 보낸다.

```json
{
  "category": {
    "type": "CUSTOM",
    "name": "코딩 테스트"
  }
}
```

| 기존 수정 요청 | 새 수정 요청 | 처리 |
| --- | --- | --- |
| `categoryCode: "CERTIFICATION"` | `category: { type: "SYSTEM", code: "CERTIFICATION" }` | 변경 필요 |
| `customCategoryName: "코딩 테스트"` | `category: { type: "CUSTOM", name: "코딩 테스트" }` | 변경 필요 |
| `category: { code: "CERTIFICATION" }` | 없음 | `type` 누락으로 `400 / Z005` |

> `POST /api/mogaks` 생성 API는 변경되지 않았습니다. 생성 요청은 계속 `categoryCode` 또는 `customCategoryName`의 평면 필드를 사용합니다. 이 변경은 **수정 API에만** 적용됩니다.

공식 카테고리의 `code`는 계속 `GET /api/metadata/mogak-categories`의 `result[].code`를 사용한다.

---

## 4. 조각 수정: 부분 수정과 일정 규칙

### 계약

```http
PATCH /api/jogaks/:jogakId
Content-Type: application/merge-patch+json
```

수정 가능한 최상위 필드는 `title`, `schedule`이다. 둘 중 하나 이상을 전송한다.

제목만 바꾸는 요청:

```json
{
  "title": "수정된 문제 풀이"
}
```

반복 일정 변경 요청:

```json
{
  "schedule": {
    "scheduleType": "WEEKLY",
    "weekdays": ["THURSDAY", "FRIDAY"],
    "effectiveTo": "2026-08-31"
  }
}
```

일회성 일정 변경 요청:

```json
{
  "schedule": {
    "scheduleType": "ONCE",
    "weekdays": []
  }
}
```

### 일정 입력 규칙

| 항목 | 규칙 |
| --- | --- |
| `schedule.effectiveFrom` | 더 이상 보내지 않는다. 서버가 현재 활성 일정의 시작일을 유지한다. |
| `scheduleType` | `ONCE` 또는 `WEEKLY`만 허용한다. |
| `WEEKLY.weekdays` | 필수. `MONDAY`~`SUNDAY` 중 하나 이상을 중복 없이 보낸다. |
| `WEEKLY.effectiveTo` | 선택. `YYYY-MM-DD` 형식이며 시작일보다 앞설 수 없다. |
| `ONCE.weekdays` | 빈 배열 `[]`로 보낸다. |
| `ONCE.effectiveTo` | 보내지 않는다. |

일정 변경은 현재 활성화된 일정에 적용된다. 과거에 끝난 조각 또는 아직 시작하지 않은 일정의 시작일을 프런트가 직접 바꾸는 기능은 제공하지 않는다.

기존 수정 요청처럼 `schedule.effectiveFrom`을 포함하거나 `WEEKLY`에서 `weekdays`를 생략하면 `400 / Z005`다.

---

## 5. 마케팅 동의 수정

경로와 메서드는 그대로지만 JSON Merge Patch 헤더가 필수가 됐다.

```http
PATCH /api/users/marketing-consent
Content-Type: application/merge-patch+json
```

```json
{
  "marketingAgreed": true
}
```

`marketingAgreed`, `advertisementAgreed` 중 하나 이상을 전송한다. 보내지 않은 동의 값은 유지된다.

---

## 6. 회원 탈퇴 응답 변경

| 기존 | 변경 |
| --- | --- |
| `POST /api/auth/withdraw` | 동일 |
| `201 Created` | `204 No Content` |
| `result: { "isDeleted": true }` | 응답 본문 없음 |

성공 처리 예시는 다음과 같다.

```ts
await api.post('/api/auth/withdraw'); // 204

clearTokens();
clearAuthenticatedCache();
navigate('/login');
```

응답 JSON이나 `result.isDeleted`를 읽지 않는다. 서버는 탈퇴한 사용자의 연결 데이터를 함께 제거하므로, 성공 직후 로그인 사용자 관련 로컬 상태·캐시를 모두 비우는 것이 안전하다.

---

## 프런트 적용 체크리스트

- [ ] 수정 API 네 곳의 HTTP 메서드를 `PATCH`로 변경했다.
- [ ] 공통 PATCH 래퍼에 `Content-Type: application/merge-patch+json`을 설정했다.
- [ ] 기존 `PUT /api/modarats`, `PUT /api/mogaks`, `PUT /api/jogaks` 호출을 제거했다.
- [ ] 모각 수정 모델을 `category: { type, code | name }` 구조로 변경했다.
- [ ] 모각 생성 모델은 기존 평면 카테고리 필드를 그대로 유지했다.
- [ ] 조각 일정 수정 모델에서 `effectiveFrom`을 제거하고 `weekdays`를 항상 전송하도록 변경했다.
- [ ] `415 / Z007`을 요청 설정 오류로 분류했다.
- [ ] 회원 탈퇴 성공 처리에서 본문 파싱과 `result.isDeleted` 확인을 제거했다.
- [ ] 탈퇴 성공 시 토큰과 인증 사용자 캐시를 제거하도록 확인했다.

## LLM 추출용 명세

```yaml
contract_delta:
  comparison:
    from: 8f7f9c9221908f2532d12c5f0ab341ba71df3540
    to: b2a83b6fa7373a3a73248349638765b0f3b138f2
  merge_patch:
    endpoints:
      - PATCH /api/modarats/:modaratId
      - PATCH /api/mogaks/:mogakId
      - PATCH /api/jogaks/:jogakId
      - PATCH /api/users/marketing-consent
    content_type: application/merge-patch+json
    response_header: Accept-Patch: application/merge-patch+json
    rejected_content_type:
      http_status: 415
      code: Z007
    rules:
      - Omitted fields are preserved.
      - Empty objects and null field values are invalid.
  mogak_patch:
    category:
      system: { type: SYSTEM, code: string }
      custom: { type: CUSTOM, name: string }
    removed_fields: [categoryCode, customCategoryName]
    creation_unchanged: true
  jogak_patch:
    fields: [title, schedule]
    schedule_removed_fields: [effectiveFrom]
    weekly_requires: [weekdays]
    once_requires: { weekdays: [] }
  withdraw:
    endpoint: POST /api/auth/withdraw
    changed_from: { http_status: 201, result: { isDeleted: true } }
    changed_to: { http_status: 204, response_body: none }
    client_rule: Clear authentication tokens and authenticated caches without parsing a body.
```
