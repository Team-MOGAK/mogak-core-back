# 기능 루트 패키징 설계

작성일: 2026-07-24
상태: 구현 완료 · 전체 검증 통과

## 목적

`src/modules`라는 한 단계의 불필요한 컨테이너를 제거한다. Auth, Users, Mogaks, Posts, Social, Storage를 `src` 바로 아래의 bounded context로 승격해, 기능 코드를 한 디렉터리 안에서 탐색할 수 있게 한다.

이 변경은 DDD식 feature-first 패키징을 명확히 하는 구조 리팩터링이다. HTTP API, 데이터 모델, Nest provider 구성, 런타임 동작은 바꾸지 않는다.

## 검토한 방식

1. **선택: bounded context를 `src` 최상단으로 승격한다.** `src/auth`, `src/users`, `src/mogaks`, `src/posts`, `src/social`, `src/storage`가 각각 자신의 application/domain/infrastructure/presentation 하위 레이어와 Nest module을 가진다. 기능 응집도를 유지하면서 `modules` 컨테이너만 제거한다.
2. `src/features/<context>`로 옮긴다. 의미는 비슷하지만, 이 프로젝트는 Nest module을 직접 사용하므로 현재의 `modules`라는 이름만 `features`로 바꾸는 효과에 가깝다.
3. `src/application/<context>`, `src/domain/<context>`처럼 레이어를 최상단으로 올린다. 한 기능의 코드가 여러 곳으로 흩어지므로 이번 DDD식 feature-first 목표와 맞지 않는다.

## 목표 구조

```text
src/
  auth/
    application/
    domain/
    infrastructure/
    presentation/
    auth.module.ts
  users/
  mogaks/                  # modarat, mogak, jogak를 같은 bounded context로 유지
  posts/
  social/
  storage/
  common/
  config/
  database/
  health/
  app.module.ts
```

`common`, `config`, `database`, `health`는 특정 bounded context가 아니므로 현재처럼 `src` 바로 아래에 둔다. `mogaks` 안의 modarat, mogak, jogak는 별도 최상단 모듈로 분리하지 않는다.

## 변경 범위

- `src/modules/{auth,users,mogaks,posts,social,storage}`를 각각 `src/{auth,users,mogaks,posts,social,storage}`로 `git mv`한다.
- 이동에 따라 모든 상대 import를 갱신한다. `src/app.module.ts`와 DB 통합 테스트의 import도 함께 바꾼다.
- 현재 구조를 설명하는 migration handoff 문서의 트리만 새 경로로 갱신한다.
- 과거 구현 계획 문서는 당시 작업의 경로 기록이므로 수정하지 않는다.
- Jest의 `src/**/*.spec.ts` 탐색, TypeScript 설정, 공개 API와 테스트 시나리오는 변경하지 않는다.

## 명시적 제외 범위

- application-to-infrastructure 직접 의존을 port로 바꾸는 작업
- 도메인 모델, DB schema, API endpoint, DTO, Nest provider의 행위 변경
- `common`, `database` 등의 최상단 cross-cutting 패키지 재구성
- import alias 추가

구조 이동과 의존성 경계 개선을 한 변경에 섞지 않아, 경로 회귀와 행위 회귀를 분리한다. 경계 개선은 이 리팩터링이 통과한 뒤 별도 작업으로 다룬다.

## 검증

- 소스와 현재 운영 문서에서 `src/modules` 경로가 남지 않았는지 확인한다. 과거 `docs/superpowers/plans/**`의 기록은 예외로 둔다.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행한다.
- `pnpm test --runInBand`, `pnpm test:e2e --runInBand`, `pnpm test:db --runInBand`를 실행한다.

## 커밋 경계

이동, import 갱신, 현재 migration handoff 갱신은 모두 하나의 원자적 `refactor` 커밋으로 남긴다. 코드 행위 변경이 없으므로 기능별 커밋으로 분할하지 않는다.
