# Feature Root Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/modules/*`의 bounded context를 `src/*` 최상단으로 옮기고, 모든 import와 현재 아키텍처 문서를 새 경로로 정합시킨다.

**Architecture:** Feature-first DDD 패키징을 유지한다. `auth`, `users`, `mogaks`, `posts`, `social`, `storage`는 자신의 하위 application/domain/infrastructure/presentation 레이어와 Nest module을 그대로 보존하며, `common`, `config`, `database`, `health`는 최상단 cross-cutting 패키지로 남긴다. 동작이나 의존성 경계는 바꾸지 않는 경로 전용 리팩터링이다.

**Tech Stack:** NestJS, TypeScript, Jest, ts-jest, pnpm, Git.

---

## 대상 파일 구조

| 현재 경로 | 목표 경로 | 책임 |
| --- | --- | --- |
| `src/modules/auth/` | `src/auth/` | 소셜 인증·JWT·세션·Guard |
| `src/modules/users/` | `src/users/` | 가입·프로필·동의·메타데이터 |
| `src/modules/mogaks/` | `src/mogaks/` | modarat·mogak·jogak·일정·실행 |
| `src/modules/posts/` | `src/posts/` | 게시글·댓글·좋아요·이미지 |
| `src/modules/social/` | `src/social/` | 팔로우·피드 |
| `src/modules/storage/` | `src/storage/` | StoragePort와 adapter |
| `src/app.module.ts` | 수정 | 새 기능 module 경로 조립 |
| `test/database/mogaks.integration.spec.ts` | 수정 | 새 Mogaks 경로 import |
| `docs/migration/2026-07-23-nestjs-migration-handoff.md` | 수정 | 현재 최상위 기능 구조 반영 |

과거 `docs/superpowers/plans/**` 문서는 당시 구현 경로를 기록하므로 수정하지 않는다.

### Task 1: 구조 계약과 이동 전 기준선 고정

**Files:**
- Test: `src/modules/{auth,users,mogaks,posts,social,storage}/**/*.spec.ts`
- Test: `test/database/mogaks.integration.spec.ts`
- Modify: 없음

- [ ] **Step 1: 현재 경로가 존재하는지 확인한다.**

Run:

```bash
find src/modules -mindepth 1 -maxdepth 1 -type d | sort
```

Expected: `auth`, `mogaks`, `posts`, `social`, `storage`, `users` 여섯 디렉터리가 출력된다.

- [ ] **Step 2: 이동 전 전체 검증을 실행한다.**

Run:

```bash
pnpm test --runInBand
pnpm test:e2e --runInBand
pnpm test:db --runInBand
```

Expected: 단위 141개, e2e 1개, DB 9개가 모두 통과한다. 로컬 리스닝 제한이 있는 환경에서는 권한 있는 환경에서 같은 명령을 실행한다.

- [ ] **Step 3: 새 구조의 정적 계약을 정의한다.**

이 리팩터링 완료 시 만족해야 할 조건은 다음이다.

```text
src/modules/ 디렉터리가 없다.
src/auth/auth.module.ts, src/users/users.module.ts,
src/mogaks/mogaks.module.ts, src/posts/posts.module.ts,
src/social/social.module.ts, src/storage/storage.module.ts가 존재한다.
src와 test의 런타임 import에 "src/modules" 또는 "./modules/"가 남지 않는다.
```

- [ ] **Step 4: 커밋하지 않는다.**

이 Task는 기준선 확인만 수행한다. 실제 파일 이동과 하나의 원자적 refactor 커밋은 Task 4에서 함께 남긴다.

### Task 2: bounded context를 `src` 최상단으로 이동한다

**Files:**
- Move: `src/modules/auth/` → `src/auth/`
- Move: `src/modules/users/` → `src/users/`
- Move: `src/modules/mogaks/` → `src/mogaks/`
- Move: `src/modules/posts/` → `src/posts/`
- Move: `src/modules/social/` → `src/social/`
- Move: `src/modules/storage/` → `src/storage/`
- Modify: `src/app.module.ts`
- Modify: `test/database/mogaks.integration.spec.ts`

- [ ] **Step 1: Git이 rename 이력을 보존하도록 여섯 context를 이동한다.**

Run:

```bash
git mv src/modules/auth src/auth
git mv src/modules/users src/users
git mv src/modules/mogaks src/mogaks
git mv src/modules/posts src/posts
git mv src/modules/social src/social
git mv src/modules/storage src/storage
```

- [ ] **Step 2: AppModule의 여섯 import를 새 최상위 context로 바꾼다.**

`src/app.module.ts`의 import는 아래와 같아야 한다.

```ts
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { MogaksModule } from './mogaks/mogaks.module';
import { PostsModule } from './posts/posts.module';
import { SocialModule } from './social/social.module';
import { UsersModule } from './users/users.module';
```

- [ ] **Step 3: DB 통합 테스트의 Mogaks import를 갱신한다.**

`test/database/mogaks.integration.spec.ts`에서 아래 두 경로를 사용한다.

```ts
import { JogaksService } from '../../src/mogaks/application/jogaks.service';
import { MogaksRepository } from '../../src/mogaks/infrastructure/mogaks.repository';
```

- [ ] **Step 4: TypeScript가 깨진 상대 import를 보고하도록 실행한다.**

Run:

```bash
pnpm typecheck
```

Expected: 아직 하위 레이어와 module root의 상향 경로가 옛 깊이를 가리키므로 FAIL한다. Task 3에서 모두 해소한다.

### Task 3: 이동 깊이에 맞춰 상대 import를 기계적으로 갱신한다

**Files:**
- Modify: `src/{auth,users,mogaks,posts,social,storage}/**/*.ts`

- [ ] **Step 1: 하위 레이어의 cross-cutting import를 한 단계 줄인다.**

이동 전후 변환 규칙은 다음과 같다. `application`, `domain`, `infrastructure`, `presentation` 및 그 spec 파일에만 적용한다.

```ts
// Before: src/modules/<context>/<layer>/...
import { AppException } from '../../../common/http/app.exception';
import type { Database } from '../../../database/database.provider';
import type { AppEnv } from '../../../config/app-env';
import { testMock } from '../../../../test/test-mock';

// After: src/<context>/<layer>/...
import { AppException } from '../../common/http/app.exception';
import type { Database } from '../../database/database.provider';
import type { AppEnv } from '../../config/app-env';
import { testMock } from '../../../test/test-mock';
```

`../../../common/`, `../../../database/`, `../../../config/`은 `../../`로, `../../../../test/`는 `../../../test/`로만 바꾼다. 같은 bounded context 내부(`../domain`, `../infrastructure`)와 다른 context(`../../auth`, `../auth`) 경로는 이동 후에도 깊이가 같으므로 바꾸지 않는다.

- [ ] **Step 2: 각 Nest module root의 common/database import를 한 단계 줄인다.**

예를 들어 `src/auth/auth.module.ts`는 다음을 사용한다.

```ts
import { FixedWindowRateLimiter } from '../common/http/fixed-window-rate-limiter';
import { RateLimitGuard } from '../common/http/rate-limit.guard';
import { DatabaseModule } from '../database/database.module';
```

`src/{auth,users,mogaks,posts,social}/*.module.ts`의 `../../common`과 `../../database`도 동일하게 `../common`, `../database`로 변경한다. 다른 bounded context의 `../auth`, `../mogaks`, `../storage` import는 유지한다.

- [ ] **Step 3: 레거시 런타임 경로와 TypeScript 해석을 확인한다.**

Run:

```bash
if rg -n "src/modules|['\"]\./modules/" src test; then exit 1; fi
pnpm typecheck
```

Expected: 두 명령 모두 성공한다.

- [ ] **Step 4: 이동된 controller와 service 테스트를 실행한다.**

Run:

```bash
pnpm test --runInBand src/auth src/users src/mogaks src/posts src/social src/storage
```

Expected: 기존 HTTP 계약과 domain/service 테스트가 새 디렉터리에서도 모두 통과한다.

### Task 4: 현재 아키텍처 문서 갱신과 전체 검증

**Files:**
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md:146-169`
- Modify: `docs/superpowers/specs/2026-07-24-feature-root-packaging-design.md`

- [ ] **Step 1: migration handoff의 최상위 기능 트리를 갱신한다.**

`docs/migration/2026-07-23-nestjs-migration-handoff.md`의 `src/modules/` 트리를 아래로 바꾼다.

```text
src/
├── auth/
├── users/
├── mogaks/
├── posts/
├── social/
└── storage/
```

모듈별 책임과 `mogaks`에 modarat·mogak·jogak를 함께 둔다는 설명은 유지한다.

- [ ] **Step 2: 설계 문서 상태를 완료로 갱신한다.**

`docs/superpowers/specs/2026-07-24-feature-root-packaging-design.md`의 상태를 `구현 완료 · 전체 검증 통과`로 바꾼다. 구현 전에는 이 줄을 변경하지 않는다.

- [ ] **Step 3: 전체 품질 게이트를 실행한다.**

Run:

```bash
git diff --check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test --runInBand
pnpm test:e2e --runInBand
pnpm test:db --runInBand
```

Expected: 모든 명령이 성공한다. Supertest 로컬 리스닝이 샌드박스에서 막히면 권한 있는 환경에서 test 명령을 재실행한다.

- [ ] **Step 4: 최종 구조 계약을 확인한다.**

Run:

```bash
test ! -d src/modules
test -f src/auth/auth.module.ts
test -f src/users/users.module.ts
test -f src/mogaks/mogaks.module.ts
test -f src/posts/posts.module.ts
test -f src/social/social.module.ts
test -f src/storage/storage.module.ts
if rg -n "src/modules|['\"]\./modules/" src test; then exit 1; fi
```

Expected: 모든 명령이 성공한다.

- [ ] **Step 5: 원자적 refactor 커밋을 만든다.**

Run:

```bash
git add src test docs/migration/2026-07-23-nestjs-migration-handoff.md docs/superpowers/specs/2026-07-24-feature-root-packaging-design.md
git commit -m "refactor: promote feature modules to src root"
```

Expected: 파일 이동과 import·현재 문서 갱신만 포함한 단일 커밋이 생성된다.
