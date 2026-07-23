# Review Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Spring 계약을 유지하면서 가입 상태 권한, Google 로그인 호환, Jogak 일정 정합성, 입력 검증, 최소 CORS를 보완한다.

**Architecture:** `AccessTokenGuard`의 인증 책임은 유지하고 USER 역할만 허용하는 후속 Guard를 조합한다. 일정 교체는 같은 짧은 transaction에서 현재·후속 구간을 계산해 겹침 없이 저장하며, 발생 건과 실행 응답은 그 일정 유형을 사용한다. CORS는 선택 환경 변수에 적힌 origin에만 적용한다.

**Tech Stack:** NestJS 11, TypeScript 5.9, Jest 30, ts-jest ESM, Drizzle ORM, PostgreSQL 17, jose

---

## 대상 파일과 책임

| 파일 | 변경 |
| --- | --- |
| `src/config/app-env.ts` / `.spec.ts` | `CORS_ALLOWED_ORIGINS` 파싱과 origin 정규화 |
| `src/app.setup.ts`, `src/main.ts`, `.env.example` | 선택 CORS 활성화와 환경 변수 예시 |
| `src/modules/auth/presentation/registered-user.guard.ts` | USER 역할 확인 전용 Guard |
| `src/modules/auth/auth.module.ts` | 역할 Guard 제공·export |
| `src/modules/{mogaks,posts,social,users}/presentation/*.ts` | 회원 전용 API에 역할 Guard 적용 |
| `src/modules/auth/infrastructure/google-identity-verifier.ts` | 유효 Google issuer 두 개 허용 |
| `src/common/validation/required-text.ts` | trim 후 빈 필수 문자열을 거부하는 공통 helper |
| `src/modules/mogaks/infrastructure/mogaks.repository.ts` | 현재·후속 일정의 비중첩 교체 |
| `src/modules/mogaks/application/jogaks.service.ts` | 실행 응답의 실제 isRoutine 계산과 필수 문자열 정규화 |
| `src/modules/{mogaks,users}/application/*.ts` | trim 후 빈 필수 문자열 거부 |
| 관련 `*.spec.ts`, `test/database/mogaks.integration.spec.ts` | 각 계약의 RED/GREEN 테스트 |

### Task 1: 선택 origin 기반 CORS를 추가한다

**Files:**
- Modify: `src/config/app-env.ts`
- Modify: `src/config/app-env.spec.ts`
- Modify: `src/app.setup.ts`
- Create: `src/app.setup.spec.ts`
- Modify: `src/main.ts`
- Modify: `.env.example`

- [x] **Step 1: 허용 origin 파싱의 실패 테스트를 작성한다.**

`src/config/app-env.spec.ts`에 다음 기대를 추가한다.

```ts
it('쉼표로 구분한 완전한 origin만 CORS 허용 목록으로 정규화한다', () => {
  expect(parseAppEnv({ ...requiredEnv, CORS_ALLOWED_ORIGINS: 'https://app.mogak.kr, https://admin.mogak.kr' }))
    .toMatchObject({ CORS_ALLOWED_ORIGINS: ['https://app.mogak.kr', 'https://admin.mogak.kr'] });
});

it('경로나 wildcard가 있는 CORS origin 설정을 기동 전에 거부한다', () => {
  expect(() => parseAppEnv({ ...requiredEnv, CORS_ALLOWED_ORIGINS: 'https://app.mogak.kr/api,*' }))
    .toThrow('CORS_ALLOWED_ORIGINS');
});
```

`src/app.setup.spec.ts`에는 `HealthModule` 앱을 만들고 허용 origin의 `GET /health`에는 `Access-Control-Allow-Origin`이, 미허용 origin에는 그 헤더가 없음을 검증한다.

```ts
await request(app.getHttpServer())
  .get('/health')
  .set('Origin', 'https://app.mogak.kr')
  .expect('Access-Control-Allow-Origin', 'https://app.mogak.kr');
await request(app.getHttpServer())
  .get('/health')
  .set('Origin', 'https://other.example')
  .expect((response) => expect(response.headers['access-control-allow-origin']).toBeUndefined());
```

- [x] **Step 2: 새 테스트가 현재 구현에서 실패하는지 확인한다.**

Run: `pnpm test src/config/app-env.spec.ts src/app.setup.spec.ts`

Expected: `CORS_ALLOWED_ORIGINS`가 AppEnv에 없고 app setup 테스트 파일도 없으므로 실패한다.

- [x] **Step 3: origin 파싱과 최소 CORS 설정을 구현한다.**

`src/config/app-env.ts`에 선택 문자열을 string array로 변환하는 schema를 추가한다. 각 항목은 `new URL(value).origin === value`이고 `https:` 또는 개발용 `http:` origin일 때만 허용하며 빈 항목은 제거한다.

```ts
CORS_ALLOWED_ORIGINS: z.string().optional().transform(parseCorsAllowedOrigins),
```

`src/app.setup.ts`는 다음 옵션을 받고 목록이 비어 있지 않을 때만 CORS를 켠다.

```ts
export function configureApp(
  app: INestApplication,
  options: Readonly<{ corsAllowedOrigins?: readonly string[] }> = {},
): void {
  if ((options.corsAllowedOrigins?.length ?? 0) > 0) {
    app.enableCors({
      origin: [...options.corsAllowedOrigins!],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'RefreshToken'],
      credentials: false,
    });
  }
  // existing global pipe and filter
}
```

`src/main.ts`는 `ConfigService<AppEnv, true>`에서 파싱된 목록을 읽어 `configureApp`에 전달한다. `.env.example`에는 비어 있는 `CORS_ALLOWED_ORIGINS=` 예시와 주석을 추가한다.

- [x] **Step 4: CORS 테스트가 통과하는지 확인한다.**

Run: `pnpm test src/config/app-env.spec.ts src/app.setup.spec.ts`

Expected: 유효 origin만 허용되고, CORS 미설정 기존 테스트에는 헤더가 추가되지 않는다.

### Task 2: 가입 상태 권한 경계를 복원한다

**Files:**
- Create: `src/modules/auth/presentation/registered-user.guard.ts`
- Create: `src/modules/auth/presentation/registered-user.guard.spec.ts`
- Modify: `src/modules/auth/auth.module.ts`
- Modify: `src/modules/mogaks/presentation/jogaks.controller.ts`
- Modify: `src/modules/mogaks/presentation/modarats-mogaks.controller.ts`
- Modify: `src/modules/posts/presentation/posts.controller.ts`
- Modify: `src/modules/social/presentation/social.controller.ts`
- Modify: `src/modules/users/presentation/user.controller.ts`
- Modify: `src/modules/users/presentation/consent.controller.ts`
- Modify: `src/modules/users/presentation/users.controller.spec.ts`

- [x] **Step 1: PENDING 거부 테스트를 작성한다.**

`registered-user.guard.spec.ts`는 request에 `{ user: { role: 'PENDING' } }`가 있으면 `new AppException(AppErrorCode.FORBIDDEN)`을, `USER`면 `true`를 기대한다.

`users.controller.spec.ts`는 Guard override가 주입하는 role을 변경 가능한 변수로 만들고 다음 HTTP 계약을 추가한다.

```ts
role = 'PENDING';
await request(app.getHttpServer()).get('/api/users/profile').expect(403);
role = 'USER';
await request(app.getHttpServer()).get('/api/users/profile').expect(200);
```

- [x] **Step 2: 현재 보호 API가 PENDING을 허용함을 확인한다.**

Run: `pnpm test src/modules/auth/presentation/registered-user.guard.spec.ts src/modules/users/presentation/users.controller.spec.ts`

Expected: Guard 파일이 없고 PENDING profile 요청은 200이므로 실패한다.

- [x] **Step 3: 역할 Guard와 route 적용을 구현한다.**

```ts
@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.role !== 'USER') throw new AppException(AppErrorCode.FORBIDDEN);
    return true;
  }
}
```

AuthModule의 `providers`와 `exports`에 Guard를 추가한다. Mogaks, Posts, Social의 보호 controller에는 `@UseGuards(AccessTokenGuard, RegisteredUserGuard)`를 적용한다. User·Consent controller는 profile, profile update, consent update, marketing endpoint만 같은 조합을 사용하고, `/join`은 `AccessTokenGuard`만 남긴다. Auth logout·withdraw와 public endpoint는 바꾸지 않는다.

- [x] **Step 4: 역할 Guard와 기존 USER 계약을 검증한다.**

Run: `pnpm test src/modules/auth/presentation/registered-user.guard.spec.ts src/modules/users/presentation/users.controller.spec.ts src/modules/mogaks/presentation src/modules/posts/presentation src/modules/social/presentation`

Expected: PENDING은 403, USER의 기존 HTTP 계약은 모두 통과한다.

### Task 3: Google issuer와 필수 문자열 검증을 보완한다

**Files:**
- Modify: `src/modules/auth/infrastructure/google-identity-verifier.ts`
- Create: `src/modules/auth/infrastructure/google-identity-verifier.spec.ts`
- Create: `src/common/validation/required-text.ts`
- Create: `src/common/validation/required-text.spec.ts`
- Modify: `src/modules/mogaks/application/mogaks.service.ts`
- Modify: `src/modules/mogaks/application/jogaks.service.ts`
- Modify: `src/modules/users/application/user.service.ts`
- Modify: `src/modules/mogaks/presentation/modarats-mogaks.controller.ts`
- Modify: `src/modules/mogaks/presentation/jogaks.controller.ts`
- Modify: `src/modules/users/presentation/user.controller.ts`
- Modify: `src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts`
- Modify: `src/modules/users/presentation/users.controller.spec.ts`

- [x] **Step 1: Google issuer와 공백 입력의 실패 테스트를 작성한다.**

Google verifier test는 exported issuer constant가 두 유효 issuer를 포함하고 다른 값은 포함하지 않음을 검증한다. `required-text.spec.ts`는 `'   '`가 `INVALID_PARAMETER` 예외가 되고 `'  모각러  '`는 `'모각러'`가 됨을 검증한다.

```ts
expect(GOOGLE_ISSUERS).toEqual(['https://accounts.google.com', 'accounts.google.com']);
```

Modarat·Mogak controller contract test와 users controller contract test에 각각 공백 전용 값을 보내 400을 기대한다.

```ts
await request(app.getHttpServer()).post('/api/modarats').send({ title: '   ', color: 'blue' }).expect(400);
await request(app.getHttpServer()).post('/api/users/nickname/verify').send({ nickname: '  ' }).expect(400);
```

- [x] **Step 2: 테스트가 현재 구현에서 실패하는지 확인한다.**

Run: `pnpm test src/modules/auth/infrastructure/google-identity-verifier.spec.ts src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts`

Expected: issuer 상수가 없고 공백 입력은 현재 validation을 통과하므로 실패한다.

- [x] **Step 3: 검증을 최소 범위로 구현한다.**

Google verifier에서 다음 상수를 사용한다.

```ts
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
// jwtVerify options
issuer: GOOGLE_ISSUERS,
```

`src/common/validation/required-text.ts`에 다음 helper를 만들고 application service에서 사용한다.

```ts
export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new AppException(AppErrorCode.INVALID_PARAMETER);
  return trimmed;
}
```

모든 필수 text DTO에 `@Matches(/\S/)`를 추가한다. `requiredTrimmed`는 Modarat/Mogak/Jogak 제목·필수 Modarat color·nickname/job/address lookup에 사용한다. optional custom category와 optional Mogak color의 현재 optional trim은 바꾸지 않는다.

- [x] **Step 4: focused 테스트를 통과시킨다.**

Run: `pnpm test src/modules/auth/infrastructure/google-identity-verifier.spec.ts src/modules/mogaks/application/mogaks.service.spec.ts src/modules/mogaks/application/jogaks.service.spec.ts src/modules/users/application/user.service.spec.ts src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts`

Expected: 두 Google issuer 설정, HTTP 400, 기존 정상 문자열 계약이 모두 통과한다.

### Task 4: 일정 비중첩과 실행 응답을 고친다

**Files:**
- Modify: `src/modules/mogaks/infrastructure/mogaks.repository.ts`
- Modify: `src/modules/mogaks/application/jogaks.service.ts`
- Modify: `src/modules/mogaks/application/jogaks.service.spec.ts`
- Modify: `test/database/mogaks.integration.spec.ts`

- [x] **Step 1: 후속 일정과 ONCE 실행의 RED 테스트를 작성한다.**

`jogaks.service.spec.ts`에 ONCE schedule fixture로 execution command를 호출해 `{ isRoutine: false }`를 기대한다.

`test/database/mogaks.integration.spec.ts`에는 초기 weekly schedule과 `2026-08-01` 시작 후속 weekly schedule을 만든 뒤, `2026-07-24` 시작 replacement를 저장하는 service integration test를 추가한다. replacement의 종료일은 `2026-07-31`이고 `2026-08-06` occurrence는 하나여야 한다.

```ts
const result = await service.update(fixture.userId, fixture.jogakId, {
  title: '수정된 문제 풀이',
  schedule: { scheduleType: 'WEEKLY', effectiveFrom: '2026-07-24', weekdays: ['THURSDAY'] },
});
expect(result.title).toBe('수정된 문제 풀이');
expect((await service.listDay(fixture.userId, '2026-08-06')).jogaks).toHaveLength(1);
```

- [x] **Step 2: 새 일정 테스트가 현재 구현에서 실패하는지 확인한다.**

Run: `pnpm test src/modules/mogaks/application/jogaks.service.spec.ts && env -u DATABASE_URL pnpm test:db -- test/database/mogaks.integration.spec.ts`

Expected: ONCE execution은 true를 반환하고 replacement는 종료일 null로 저장되어 후속 구간과 중복되므로 실패한다.

- [x] **Step 3: 현재·후속 구간을 계산해 저장한다.**

`replaceOwnedJogakSchedule` transaction에서 대상 Jogak의 `id`, `effectiveFrom`, `effectiveTo` 전체를 읽는다. 새 시작일이 같은 기존 row는 `INVALID_EFFECTIVE_FROM`으로 거부한다. 현재 구간은 새 시작일 전날에 닫고, 후속 구간이 있으면 다음 규칙으로 effectiveTo를 정한다.

```ts
const successorEnd = successor === undefined ? null : previousDate(successor.effectiveFrom);
if (input.schedule.effectiveTo !== null && successor !== undefined && input.schedule.effectiveTo >= successor.effectiveFrom) {
  return 'INVALID_EFFECTIVE_FROM';
}
const effectiveTo = input.schedule.effectiveTo ?? successorEnd;
```

`commandExecution`은 `occursOn`을 만족한 schedule 하나를 보관하고, `toExecutionResponse`·`transitionExisting`에 `schedule.scheduleType === 'WEEKLY'`를 전달한다. `toExecutionResponse`는 전달받은 boolean을 그대로 `isRoutine`으로 반환한다.

- [x] **Step 4: 단위·DB 정합성 테스트를 통과시킨다.**

Run: `pnpm test src/modules/mogaks/application/jogaks.service.spec.ts && env -u DATABASE_URL pnpm test:db -- test/database/mogaks.integration.spec.ts`

Expected: ONCE/WEEKLY 응답 구분, 후속 일정 보존, 하루 occurrence 하나, 기존 title snapshot 보존이 모두 통과한다.

### Task 5: 문서와 전체 품질 게이트를 완료한다

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`
- Modify: `docs/superpowers/specs/2026-07-24-review-corrections-design.md` (검증 결과만)
- Modify: `docs/superpowers/plans/2026-07-24-review-corrections-implementation.md` (완료 상태만)

- [x] **Step 1: 설정·권한·일정 정책 문서를 갱신한다.**

인수인계 문서에 `CORS_ALLOWED_ORIGINS`의 선택 구성, PENDING/USER 경계, 일정 후속 구간 비중첩 규칙, Google issuer 호환을 추가한다. 실제 Storage 및 index 정책은 변경하지 않는다.

- [x] **Step 2: 전체 정적 품질 게이트를 실행한다.**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`

Expected: 포맷, lint, 타입 검사, Nest build가 모두 성공한다.

- [x] **Step 3: 전체 Jest 테스트 게이트를 실행한다.**

Run: `pnpm test && pnpm test:e2e && env -u DATABASE_URL pnpm test:db`

Expected: 일반·E2E·PostgreSQL 통합 테스트가 모두 통과한다.

- [x] **Step 4: 범위와 회귀를 최종 점검한다.**

Run: `git diff --check && rg -n "enableCors|CORS_ALLOWED_ORIGINS|RegisteredUserGuard|GOOGLE_ISSUERS" src .env.example docs`

Expected: CORS는 명시 origin만, 역할 Guard는 USER 전용 endpoint만, 새로운 index/CHECK/lock은 없으며 문서와 구현이 일치한다.

- [x] **Step 5: 보완 변경을 한 커밋으로 기록한다.**

Run:

```bash
git add .env.example docs src test
git commit -m "fix: enforce migration contracts"
```

Expected: 검토에서 확인한 계약 보완과 회귀 테스트가 하나의 재현 가능한 커밋으로 남는다.
