# Social Migration Design

## 목적

팔로우 관계, 팔로잉(Pacemaker) 피드, 지역 기반 네트워킹 피드를 NestJS로 옮긴다. 기존 공개 Spring API의 경로와 query parameter는 유지하고, 이미 승인된 `author` 중첩 응답과 가상 Jogak 실행 기반 Posts 모델을 사용한다.

## 범위와 API 계약

- `POST /api/users/follows/{nickname}`과 `DELETE /api/users/follows/{nickname}`은 nickname 입력을 유지하며 성공 응답은 기존 실제 동작처럼 `BaseResponse`의 `result: "SUCCESS"`와 `200 OK`를 반환한다.
- `GET /api/users/follows/counts/{nickname}`, `GET /api/users/follows/{nickname}/motos`, `GET /api/users/follows/{nickname}/mentors`를 유지한다. Spring 전역 보안 정책과 맞춰 모두 access token이 필요하다.
- `GET /api/posts/pacemakers?cursor=&size=`를 유지한다. 기존 구현에서 `cursor`는 cursor token이 아니라 zero-based page number로 사용되므로 이름과 의미를 바꾸지 않는다. 응답은 목록이다.
- `GET /api/posts?page=&size=&sort=&address=`를 유지한다. `page`는 생략하면 0, `sort`는 생략하면 `createdAt`, `address`는 생략하면 인증 사용자의 거주지다.
- 피드와 피드 안의 댓글 작성자는 승인된 형태로 반환한다.

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

기존 평면 `userName`, `userJob`, `user`, 댓글 `nickname`은 이 `author`로 교체한다. `viewCnt`는 실제 증가 로직이 없으므로 응답과 저장 모델에 추가하지 않는다.

## 데이터와 정합성

`follows`는 다음 한 테이블로 충분하다.

```text
follows(
  id bigint PK,
  follower_id bigint NOT NULL FK -> users ON DELETE CASCADE,
  following_id bigint NOT NULL FK -> users ON DELETE CASCADE,
  created_at,
  UNIQUE(follower_id, following_id)
)
```

- 팔로우 대상 nickname은 API 경계에서만 해석하고 DB에는 두 user ID만 저장한다.
- 자기 자신 팔로우는 애플리케이션에서 `Z005`로 거부한다. DB `CHECK`는 추가하지 않는다.
- 생성은 `INSERT ... ON CONFLICT DO NOTHING`으로 원자화한다. 삽입되지 않으면 `F001`, 삭제 대상이 없으면 `F002`로 반환한다.
- user hard delete는 follower/following 어느 방향의 행도 FK cascade로 제거한다.
- follow count는 `follows` 행을 집계한다. profile에 카운터를 저장하지 않는다.
- 이 UNIQUE 외에는 CHECK, soft delete, archive, lock, slot, 성능 index를 넣지 않는다.

## 피드 조회

팔로잉 피드는 `follows.follower_id = 현재 사용자`인 author의 Posts를 `created_at DESC, id DESC`로 조회한다. 지역 피드는 선택한 address의 author Posts를 조회하고, address가 없으면 현재 사용자의 주소를 먼저 해석한다. `sort=likeCnt`는 `post_likes` 원본 행 수를 projection으로 계산해 정렬하며, 다른 sort 값은 `Z005`로 거부한다.

두 피드는 Posts, users, jobs, addresses를 명시 join한 한 번의 목록 projection으로 page/size + 1을 가져온다. 이미지와 댓글은 현재 page의 post ID 집합에 대해서만 각각 한 번씩 조회해 조립한다. 각 comment author의 profile image key와 post image storage key는 `StoragePort.resolvePublicUrl`로 URL로 바꾼다. 아직 비활성 Storage 구현에서는 null URL을 응답에 넣지 않는다.

좋아요 수·댓글 수는 projection의 source row에서 계산한다. 조회 수와 저장 카운터를 쓰지 않으며, 조회 중이나 좋아요/팔로우 변경 중 `FOR UPDATE`를 사용하지 않는다.

## 모듈 경계와 오류

`social` 모듈은 follow write와 social read projection을 소유한다. Posts 테이블을 쓰지 않고, 피드에 필요한 cross-module join은 읽기 전용 repository에서만 수행한다. 이미 Posts 모듈이 제공하는 `POST /api/posts/like`는 그대로 사용하며 중복 like route를 만들지 않는다.

기존 오류를 유지한다.

- 대상 사용자 없음: `U001`
- 중복 팔로우: `F001`
- 없는 팔로우 삭제: `F002`
- 잘못된 nickname, pagination, sort, 자기 자신 팔로우: `Z005`

## 검증

단위·HTTP 계약 테스트는 nickname 경로, 중복/자기 자신 방지, hard delete 응답, mentor/moto 방향, 주소 기본값, 두 sort, 중첩 author, 없는 legacy like 경로를 확인한다. PostgreSQL 통합 테스트는 follow UNIQUE와 user hard delete cascade를 추가한다. 현재 `_test` PostgreSQL이 기동되지 않은 환경에서는 통합 테스트를 통과로 기록하지 않는다.
