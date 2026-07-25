# Domain Entity and Type Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the NestJS codebase around database-backed domain entities, explicit layer-owned TypeScript contracts, role-specific folders, and Zod validation without DTO classes.

**Architecture:** Migrate one vertical feature slice at a time so every slice leaves typecheck and its focused tests green. Domain entities live in `domain/entity`, application contracts and services in `application/type|port|service`, persistence contracts and repositories in `infrastructure/type|repository`, and HTTP contracts and controllers in `presentation/type|controller`. Infrastructure implements application ports; DTO classes and outward domain dependencies are eliminated.

**Tech Stack:** TypeScript 5.9, NestJS 11, Zod 4, Drizzle ORM, Jest 30, ESLint 10, pnpm 10

---

## File Structure

The completed migration must use these role directories:

```text
src/<feature>/
├── domain/
│   ├── entity/
│   └── vo/                 # only when a justified VO exists
├── application/
│   ├── type/
│   ├── port/
│   └── service/
├── infrastructure/
│   ├── type/
│   └── repository/
└── presentation/
    ├── type/
    └── controller/
```

Do not create empty directories. Keep Nest module files at each feature root.

### Task 1: Replace DTO-metatype validation with schema-aware decorators

**Files:**
- Create: `src/common/validation/zod-parameter.decorator.ts`
- Create: `test/common/validation/zod-parameter.decorator.spec.ts`
- Delete after Task 6: `src/common/validation/zod-validation.pipe.ts`
- Delete after Task 6: `test/common/validation/zod-validation.pipe.spec.ts`
- Modify after Task 6: `src/app.setup.ts`

- [ ] **Step 1: Write the failing schema pipe tests**

```ts
import { z } from 'zod';

import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import { zodParsePipe } from '../../../src/common/validation/zod-parameter.decorator';

describe('Zod parameter validation', () => {
  const schema = z
    .object({ id: z.coerce.number().int().positive().refine(Number.isSafeInteger) })
    .strict();

  it('parses and coerces with the supplied schema', () => {
    expect(zodParsePipe(schema).transform({ id: '7' }, { type: 'param' })).toEqual({ id: 7 });
  });

  it('maps a schema failure to INVALID_PARAMETER', () => {
    expect(() =>
      zodParsePipe(schema).transform({ id: '0', unexpected: true }, { type: 'param' }),
    ).toThrow(new DomainException(AppErrorCode.INVALID_PARAMETER));
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- --runInBand test/common/validation/zod-parameter.decorator.spec.ts`

Expected: FAIL because `zod-parameter.decorator.ts` does not exist.

- [ ] **Step 3: Implement schema-aware parsing and parameter decorators**

```ts
import { Body, Param, Query, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

import { AppErrorCode } from '../http/app-error-code';
import { DomainException } from '../http/domain.exception';

export function zodParsePipe<TSchema extends z.ZodType>(
  schema: TSchema,
): PipeTransform<unknown, z.output<TSchema>> {
  return {
    transform(value: unknown): z.output<TSchema> {
      const result = schema.safeParse(value);
      if (!result.success) {
        throw new DomainException(AppErrorCode.INVALID_PARAMETER);
      }
      return result.data;
    },
  };
}

export function ZodBody<TSchema extends z.ZodType>(schema: TSchema): ParameterDecorator {
  return Body(zodParsePipe(schema));
}

export function ZodQuery<TSchema extends z.ZodType>(schema: TSchema): ParameterDecorator {
  return Query(zodParsePipe(schema));
}

export function ZodParams<TSchema extends z.ZodType>(schema: TSchema): ParameterDecorator {
  return Param(zodParsePipe(schema));
}
```

- [ ] **Step 4: Run focused validation tests and verify GREEN**

Run: `pnpm test -- --runInBand test/common/validation/zod-parameter.decorator.spec.ts test/common/validation/multipart-json.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the validation foundation**

```bash
git add src/common/validation/zod-parameter.decorator.ts test/common/validation/zod-parameter.decorator.spec.ts
git commit -m "refactor: add schema-aware request validation"
```

### Task 2: Refactor Auth around domain entities and application ports

**Files:**
- Create: `src/auth/domain/entity/auth.entity.ts`
- Create: `src/auth/application/type/auth.command.ts`
- Create: `src/auth/application/type/auth.result.ts`
- Create: `src/auth/application/type/authenticated-principal.ts`
- Create: `src/auth/application/port/auth-persistence.port.ts`
- Create: `src/auth/application/port/social-identity-verifier.port.ts`
- Create: `src/auth/application/port/token-issuer.port.ts`
- Move: `src/auth/application/auth.service.ts` → `src/auth/application/service/auth.service.ts`
- Create: `src/auth/infrastructure/type/auth.record.ts`
- Move: `src/auth/infrastructure/auth.persistence.ts` → `src/auth/infrastructure/repository/auth.repository.ts`
- Move: `src/auth/infrastructure/auth-sessions.repository.ts` → `src/auth/infrastructure/repository/auth-sessions.repository.ts`
- Move: `src/auth/infrastructure/token.service.ts` → `src/auth/infrastructure/service/token.service.ts`
- Move: `src/auth/infrastructure/apple-identity-verifier.ts` → `src/auth/infrastructure/verifier/apple-identity-verifier.ts`
- Move: `src/auth/infrastructure/google-identity-verifier.ts` → `src/auth/infrastructure/verifier/google-identity-verifier.ts`
- Move: `src/auth/infrastructure/kakao-identity-verifier.ts` → `src/auth/infrastructure/verifier/kakao-identity-verifier.ts`
- Move: `src/auth/infrastructure/identity-claims.ts` → `src/auth/infrastructure/verifier/identity-claims.ts`
- Move: `src/auth/infrastructure/social-identity-verifier.registry.ts` → `src/auth/infrastructure/verifier/social-identity-verifier.registry.ts`
- Create: `src/auth/presentation/type/auth.request.ts`
- Create: `src/auth/presentation/type/auth.response.ts`
- Move: `src/auth/presentation/auth.controller.ts` → `src/auth/presentation/controller/auth.controller.ts`
- Move: `src/auth/presentation/access-token.guard.ts` → `src/auth/presentation/controller/access-token.guard.ts`
- Move: `src/auth/presentation/registered-user.guard.ts` → `src/auth/presentation/controller/registered-user.guard.ts`
- Move: `src/auth/presentation/current-user.decorator.ts` → `src/auth/presentation/controller/current-user.decorator.ts`
- Modify: `src/auth/auth.module.ts`
- Test: `test/auth/domain/entity/auth.entity.spec.ts`
- Modify: `test/auth/application/auth.service.spec.ts`
- Modify: `test/auth/infrastructure/auth-sessions.repository.spec.ts`
- Modify: `test/auth/infrastructure/google-identity-verifier.spec.ts`
- Modify: `test/auth/infrastructure/identity-claims.spec.ts`
- Modify: `test/auth/infrastructure/kakao-identity-verifier.spec.ts`
- Modify: `test/auth/infrastructure/social-identity-verifier.registry.spec.ts`
- Modify: `test/auth/infrastructure/token.service.spec.ts`
- Modify: `test/auth/presentation/access-token.guard.spec.ts`
- Modify: `test/auth/presentation/auth.controller.spec.ts`
- Modify: `test/auth/presentation/registered-user.guard.spec.ts`

- [ ] **Step 1: Write failing domain rule tests**

```ts
import {
  canRotateSession,
  validateNewSocialIdentity,
  type AuthSession,
} from '../../../../src/auth/domain/entity/auth.entity';

describe('Auth entities', () => {
  it('rotates only an active session with the matching refresh hash', () => {
    const session: AuthSession = {
      id: 'session-id',
      userId: 7,
      refreshTokenHash: 'current',
      expiresAt: new Date('2026-08-01T00:00:00Z'),
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
    };
    expect(canRotateSession(session, 'current', new Date('2026-07-25T00:00:00Z'))).toBe(true);
    expect(canRotateSession(session, 'wrong', new Date('2026-07-25T00:00:00Z'))).toBe(false);
  });

  it('requires a verified email except for Kakao', () => {
    expect(
      validateNewSocialIdentity({
        provider: 'GOOGLE',
        providerUserId: 'google-user',
        email: null,
        emailVerified: false,
      }),
    ).toEqual({
      success: false,
      reason: 'EMAIL_REQUIRED',
    });
  });
});
```

The entity module owns the rule input shape used above:

```ts
export type VerifiedSocialIdentity = Readonly<{
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}>;
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `pnpm test -- --runInBand test/auth/domain/entity/auth.entity.spec.ts`

Expected: FAIL because the entity module does not exist.

- [ ] **Step 3: Add Auth entity types and rules**

`auth.entity.ts` must export natural names without an `Entity` postfix:

```ts
export type SocialProvider = 'APPLE' | 'GOOGLE' | 'KAKAO';

export type SocialAccount = Readonly<{
  id: number;
  userId: number;
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AuthSession = Readonly<{
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;
```

Keep social identity validation and session eligibility functions in this module. They return
discriminated outcomes and do not import Nest, Zod, Drizzle, or `DomainException`.

- [ ] **Step 4: Define application-owned Auth contracts and ports**

`auth.command.ts` owns login, refresh, session issue, and rotation commands. `auth.result.ts` owns
`IssueTokenResult` and login/refresh results. `authenticated-principal.ts` owns `UserRole` and
`AuthenticatedPrincipal`. The three port files expose persistence, verifier, and token operations;
their method signatures use domain entities and application types only.

Move the existing service under `application/service`, inject port tokens, and remove every
`../infrastructure` import. Make `AccessTokenGuard` call an Auth application service method rather
than `AuthSessionsRepository` and `TokenService` directly.

- [ ] **Step 5: Replace Auth DTO classes with request schemas and inferred types**

`auth.request.ts` must export `appleLoginRequestSchema`, `AppleLoginRequest`,
`socialLoginRequestSchema`, `SocialLoginRequest`, `providerParamsSchema`, and `ProviderParams`.
Use `@ZodBody` and `@ZodParams` in the relocated controller. `auth.response.ts` owns explicit login
and token response payloads.

- [ ] **Step 6: Update adapters, module wiring, and tests**

Move database-backed Auth classes into `infrastructure/repository`, implement the application
ports, and update `auth.module.ts` provider tokens. Update test imports and replace concrete
infrastructure mocks in application tests with port-shaped fakes.

- [ ] **Step 7: Verify and commit Auth**

Run:

```bash
pnpm test -- --runInBand test/auth
pnpm typecheck
pnpm lint
```

Expected: all commands PASS and `rg -n "createZodDto|application/.+infrastructure" src/auth test/auth`
returns no matches.

```bash
git add src/auth test/auth
git commit -m "refactor: establish auth domain and type boundaries"
```

### Task 3: Refactor Users and Consent around database entities

**Files:**
- Create: `src/users/domain/entity/user.entity.ts`
- Create: `src/users/domain/entity/user-metadata.entity.ts`
- Create: `src/users/domain/entity/consent.entity.ts`
- Create: `src/users/application/type/user.command.ts`
- Create: `src/users/application/type/user.query.ts`
- Create: `src/users/application/type/user.result.ts`
- Create: `src/users/application/type/consent.command.ts`
- Create: `src/users/application/type/consent.query.ts`
- Create: `src/users/application/type/consent.result.ts`
- Create: `src/users/application/type/metadata.result.ts`
- Create: `src/users/application/port/user.repository.port.ts`
- Create: `src/users/application/port/consent.repository.port.ts`
- Create: `src/users/application/port/metadata.repository.port.ts`
- Move: `src/users/application/user.service.ts` → `src/users/application/service/user.service.ts`
- Move: `src/users/application/consent.service.ts` → `src/users/application/service/consent.service.ts`
- Move: `src/users/application/metadata.service.ts` → `src/users/application/service/metadata.service.ts`
- Create: `src/users/infrastructure/type/user.record.ts`
- Create: `src/users/infrastructure/type/user.projection.ts`
- Create: `src/users/infrastructure/type/consent.record.ts`
- Create: `src/users/infrastructure/type/metadata.record.ts`
- Move: `src/users/infrastructure/user.repository.ts` → `src/users/infrastructure/repository/user.repository.ts`
- Move: `src/users/infrastructure/consent.repository.ts` → `src/users/infrastructure/repository/consent.repository.ts`
- Move: `src/users/infrastructure/metadata.repository.ts` → `src/users/infrastructure/repository/metadata.repository.ts`
- Create: `src/users/presentation/type/users.request.ts`
- Create: `src/users/presentation/type/users.response.ts`
- Create: `src/users/presentation/type/consent.request.ts`
- Create: `src/users/presentation/type/consent.response.ts`
- Create: `src/users/presentation/type/metadata.response.ts`
- Move: `src/users/presentation/user.controller.ts` → `src/users/presentation/controller/user.controller.ts`
- Move: `src/users/presentation/consent.controller.ts` → `src/users/presentation/controller/consent.controller.ts`
- Move: `src/users/presentation/metadata.controller.ts` → `src/users/presentation/controller/metadata.controller.ts`
- Modify: `src/users/users.module.ts`
- Test: `test/users/domain/entity/user.entity.spec.ts`
- Test: `test/users/domain/entity/consent.entity.spec.ts`
- Modify: `test/users/application/user.service.spec.ts`
- Modify: `test/users/application/consent.service.spec.ts`
- Modify: `test/users/presentation/users.controller.spec.ts`

- [ ] **Step 1: Write failing User and Consent domain tests**

Test `canCompleteRegistration('PENDING', 'PENDING')`, nickname normalization, duplicate consent
selection, inactive items, and missing required consent. Use concrete `User`, `ConsentItem`, and
`UserConsent` values matching the database columns.

- [ ] **Step 2: Run domain tests and verify RED**

Run: `pnpm test -- --runInBand test/users/domain/entity`

Expected: FAIL because the entity modules do not exist.

- [ ] **Step 3: Add all Users database entity representations**

`user.entity.ts` exports `User` and `UserRole`; `user-metadata.entity.ts` exports `Job` and
`Address`; `consent.entity.ts` exports `ConsentItem` and `UserConsent`. Each type includes its
database identity, nullable state, and timestamps. Place registration, nickname, and consent rules
beside their owning entities.

- [ ] **Step 4: Split layer contracts and move implementations**

Create explicit `JoinUserCommand`, `UpdateNicknameCommand`, `UpdateConsentCommand`,
`GetUserProfileQuery`, and operation-specific Results under `application/type`. Define repository,
token issuer, and storage ports under `application/port`. Move the three services under
`application/service`, repositories under `infrastructure/repository`, and Records/Projections
under `infrastructure/type`.

The application layer must not import Auth infrastructure. Use the Auth token issuer port and
`AuthenticatedPrincipal` application type.

- [ ] **Step 5: Replace Users DTO classes and move presentation files**

Create request schemas and inferred types for nickname, job, join, consent update, and marketing
consent under `presentation/type`. Create explicit response types for profile, metadata, consent,
and registration endpoints. Relocate controllers under `presentation/controller` and use
`@ZodBody`.

- [ ] **Step 6: Verify and commit Users**

Run:

```bash
pnpm test -- --runInBand test/users
pnpm typecheck
pnpm lint
```

Expected: PASS and no Users source imports `../infrastructure` from application.

```bash
git add src/users test/users src/auth/auth.module.ts
git commit -m "refactor: establish users domain and type boundaries"
```

### Task 4: Refactor Mogaks, Jogaks, schedules, and executions

**Files:**
- Create: `src/mogaks/domain/entity/modarat.entity.ts`
- Create: `src/mogaks/domain/entity/mogak.entity.ts`
- Create: `src/mogaks/domain/entity/jogak.entity.ts`
- Replace: `src/mogaks/domain/occurrence.ts`
- Replace: `src/mogaks/domain/execution-transition.ts`
- Create: `src/mogaks/application/type/mogak.command.ts`
- Create: `src/mogaks/application/type/mogak.query.ts`
- Create: `src/mogaks/application/type/mogak.result.ts`
- Create: `src/mogaks/application/type/jogak.command.ts`
- Create: `src/mogaks/application/type/jogak.query.ts`
- Create: `src/mogaks/application/type/jogak.result.ts`
- Create: `src/mogaks/application/port/mogaks.repository.port.ts`
- Create: `src/mogaks/application/port/owned-mogak.port.ts`
- Create: `src/mogaks/application/port/owned-occurrence.port.ts`
- Move: `src/mogaks/application/mogaks.service.ts` → `src/mogaks/application/service/mogaks.service.ts`
- Move: `src/mogaks/application/jogaks.service.ts` → `src/mogaks/application/service/jogaks.service.ts`
- Create: `src/mogaks/infrastructure/type/mogak.record.ts`
- Create: `src/mogaks/infrastructure/type/jogak.record.ts`
- Create: `src/mogaks/infrastructure/type/occurrence.projection.ts`
- Move: `src/mogaks/infrastructure/mogaks.repository.ts` → `src/mogaks/infrastructure/repository/mogaks.repository.ts`
- Create: `src/mogaks/presentation/type/mogaks.request.ts`
- Create: `src/mogaks/presentation/type/mogaks.response.ts`
- Create: `src/mogaks/presentation/type/jogaks.request.ts`
- Create: `src/mogaks/presentation/type/jogaks.response.ts`
- Move: `src/mogaks/presentation/modarats-mogaks.controller.ts` → `src/mogaks/presentation/controller/modarats-mogaks.controller.ts`
- Move: `src/mogaks/presentation/jogaks.controller.ts` → `src/mogaks/presentation/controller/jogaks.controller.ts`
- Move: `src/mogaks/presentation/mogaks-metadata.controller.ts` → `src/mogaks/presentation/controller/mogaks-metadata.controller.ts`
- Modify: `src/mogaks/mogaks.module.ts`
- Create: `test/mogaks/domain/entity/jogak.entity.spec.ts`
- Modify: `test/mogaks/application/mogaks.service.spec.ts`
- Modify: `test/mogaks/application/jogaks.service.spec.ts`
- Modify: `test/mogaks/domain/occurrence.spec.ts`
- Modify: `test/mogaks/domain/execution-transition.spec.ts`
- Modify: `test/mogaks/presentation/modarats-mogaks.controller.spec.ts`
- Modify: `test/mogaks/presentation/jogaks.controller.spec.ts`

- [ ] **Step 1: Extend existing domain tests before moving behavior**

Add failing tests for:

- `Modarat` maximum of eight Mogaks;
- `Mogak` maximum of eight active/current Jogaks;
- predefined versus custom Mogak category exclusivity;
- ONCE and WEEKLY `JogakSchedule` validity;
- duplicate/unsupported weekdays;
- occurrence calculation;
- `JogakExecution` transition and title snapshot preservation.

- [ ] **Step 2: Run domain tests and verify RED**

Run: `pnpm test -- --runInBand test/mogaks/domain`

Expected: new tests FAIL because the entity modules and extracted rules are missing.

- [ ] **Step 3: Create entity modules representing all Mogaks tables**

`modarat.entity.ts` exports `Modarat`; `mogak.entity.ts` exports `Mogak` and `MogakCategory`;
`jogak.entity.ts` exports `Jogak`, `JogakSchedule`, `JogakScheduleWeekday`, and `JogakExecution`.
Move schedule validation, occurrence functions, capacity rules, category selection, and execution
transition functions into the owning entity files. Do not create `JogakScheduleVo`.

Delete the old `occurrence.ts` and `execution-transition.ts` only after all imports and tests use
the entity modules.

- [ ] **Step 4: Split Mogaks layer contracts**

Under `application/type`, define operation-specific Commands, Queries, and Results for Modarat,
Mogak, Jogak, schedule, occurrence, and execution use cases. Under `application/port`, define the
repository port and the narrow owned-Mogak/owned-occurrence ports consumed by Posts.

Move services to `application/service`. Split the 682-line repository into:

```text
src/mogaks/infrastructure/
├── type/
│   ├── mogak.record.ts
│   ├── jogak.record.ts
│   └── occurrence.projection.ts
└── repository/
    └── mogaks.repository.ts
```

The repository implements the application port and maps persisted schedule/status strings at the
infrastructure boundary.

- [ ] **Step 5: Replace Mogaks DTO classes and move presentation**

Create schema/inferred-type files for Modarat, Mogak, Jogak, date range, IDs, and execution params.
Move the three controllers under `presentation/controller` and use `@ZodBody`, `@ZodQuery`, and
`@ZodParams`. Create explicit response types without reusing application Results.

- [ ] **Step 6: Verify and commit Mogaks**

Run:

```bash
pnpm test -- --runInBand test/mogaks
pnpm test:db -- --runInBand test/database/mogaks.integration.spec.ts
pnpm typecheck
pnpm lint
```

Expected: PASS; `src/mogaks/application` has no infrastructure imports; no Mogaks DTO class remains.

```bash
git add src/mogaks test/mogaks test/database/mogaks.integration.spec.ts
git commit -m "refactor: establish mogaks domain and type boundaries"
```

### Task 5: Refactor Posts around the Post entity module

**Files:**
- Create: `src/posts/domain/entity/post.entity.ts`
- Create: `src/posts/application/type/post.command.ts`
- Create: `src/posts/application/type/post.query.ts`
- Create: `src/posts/application/type/post.result.ts`
- Create: `src/posts/application/port/post.repository.port.ts`
- Move: `src/posts/application/posts.service.ts` → `src/posts/application/service/posts.service.ts`
- Create: `src/posts/infrastructure/type/post.record.ts`
- Create: `src/posts/infrastructure/type/post.projection.ts`
- Move: `src/posts/infrastructure/posts.repository.ts` → `src/posts/infrastructure/repository/posts.repository.ts`
- Create: `src/posts/presentation/type/posts.request.ts`
- Create: `src/posts/presentation/type/posts.response.ts`
- Move: `src/posts/presentation/posts.controller.ts` → `src/posts/presentation/controller/posts.controller.ts`
- Modify: `src/posts/posts.module.ts`
- Create: `test/posts/domain/entity/post.entity.spec.ts`
- Modify: `test/posts/application/posts.service.spec.ts`
- Modify: `test/posts/presentation/posts.controller.spec.ts`
- Modify: `test/database/posts.integration.spec.ts`

- [ ] **Step 1: Write failing Post domain tests**

Test Post and PostComment content normalization/limits, author ownership, PostLike identity, and the
one-Post-per-JogakExecution rule. Construct `Post`, `PostImage`, `PostComment`, and `PostLike`
values with all database-backed fields.

- [ ] **Step 2: Run domain tests and verify RED**

Run: `pnpm test -- --runInBand test/posts/domain/entity/post.entity.spec.ts`

Expected: FAIL because `post.entity.ts` does not exist.

- [ ] **Step 3: Implement the Post entity module**

Export `Post`, `PostImage`, `PostComment`, and `PostLike` without `Entity` postfixes. Move
`validatePostContents`, `validateCommentContents`, and ownership decisions out of
`PostsService`. Domain failures are discriminated results; the service maps them to existing
`AppErrorCode` values.

- [ ] **Step 4: Split Posts contracts and dependencies**

Create explicit application Commands, Queries, Results, and `PostRepositoryPort`. Depend on
`OwnedOccurrencePort` and `OwnedMogakPort` exported by Mogaks application rather than its concrete
services. Keep storage behind its existing application port. Move `PostsService` under
`application/service`; it must not import `PostsRepository`, `PostCommentRecord`, `MogaksService`,
or `JogaksService` concretely.

Move Records/Projections into `infrastructure/type`, the repository into
`infrastructure/repository`, and implement the application port.

- [ ] **Step 5: Replace Posts DTO classes and move presentation**

Create Zod schemas and inferred Request/Params/QueryRequest types for every current endpoint under
`presentation/type`. Keep multipart request parsing explicit. Create response types and relocate
the controller under `presentation/controller`.

- [ ] **Step 6: Verify and commit Posts**

Run:

```bash
pnpm test -- --runInBand test/posts
pnpm test:db -- --runInBand test/database/posts.integration.spec.ts
pnpm typecheck
pnpm lint
```

Expected: PASS and no Posts application import reaches infrastructure or another feature service.

```bash
git add src/posts test/posts test/database/posts.integration.spec.ts src/posts/posts.module.ts
git commit -m "refactor: establish posts domain and type boundaries"
```

### Task 6: Refactor Social and remove remaining DTO infrastructure

**Files:**
- Create: `src/social/domain/entity/follow.entity.ts`
- Create: `src/social/application/type/social.command.ts`
- Create: `src/social/application/type/social.query.ts`
- Create: `src/social/application/type/social.result.ts`
- Create: `src/social/application/port/social.repository.port.ts`
- Move: `src/social/application/social.service.ts` → `src/social/application/service/social.service.ts`
- Create: `src/social/infrastructure/type/social.record.ts`
- Create: `src/social/infrastructure/type/feed.projection.ts`
- Move: `src/social/infrastructure/social.repository.ts` → `src/social/infrastructure/repository/social.repository.ts`
- Create: `src/social/presentation/type/social.request.ts`
- Create: `src/social/presentation/type/social.response.ts`
- Move: `src/social/presentation/social.controller.ts` → `src/social/presentation/controller/social.controller.ts`
- Modify: `src/social/social.module.ts`
- Create: `test/social/domain/entity/follow.entity.spec.ts`
- Modify: `test/social/application/social.service.spec.ts`
- Modify: `test/social/presentation/social.controller.spec.ts`
- Modify: `test/database/social.integration.spec.ts`
- Modify: `src/app.setup.ts`
- Delete: `src/common/validation/zod-validation.pipe.ts`
- Delete: `test/common/validation/zod-validation.pipe.spec.ts`
- Modify: `package.json`
- Modify mechanically: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing Follow rule test**

```ts
import { canCreateFollow } from '../../../../src/social/domain/entity/follow.entity';

describe('Follow entity', () => {
  it('rejects self-follow and accepts distinct users', () => {
    expect(canCreateFollow(7, 7)).toEqual({ success: false, reason: 'SELF_FOLLOW' });
    expect(canCreateFollow(7, 8)).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- --runInBand test/social/domain/entity/follow.entity.spec.ts`

Expected: FAIL because `follow.entity.ts` does not exist.

- [ ] **Step 3: Add Follow entity/rules and split Social layers**

`follow.entity.ts` exports `Follow` with `id`, `followerId`, `followingId`, and `createdAt`, plus
self-follow eligibility. Feed rows remain infrastructure Projections, not domain entities.

Create Social Commands, Queries, Results, and repository/storage ports; relocate the service,
repository, controller, and their layer-owned types into the approved role directories.

- [ ] **Step 4: Replace Social DTO classes**

Move nickname params, pacemaker query, and network query schemas/types under `presentation/type`.
Use the schema-aware decorators and retain existing default/coercion behavior.

- [ ] **Step 5: Remove obsolete global validation and dependency**

After `rg -n "createZodDto" src test` returns no matches:

- remove `AppZodValidationPipe` registration from `app.setup.ts`;
- delete its source and test;
- run `pnpm remove nestjs-zod` to update `package.json` and `pnpm-lock.yaml`;
- verify `rg -n "nestjs-zod|createZodDto|AppZodValidationPipe" src test package.json` has no output.

- [ ] **Step 6: Verify and commit Social plus validation cleanup**

Run:

```bash
pnpm test -- --runInBand test/social test/common/validation
pnpm test:db -- --runInBand test/database/social.integration.spec.ts
pnpm typecheck
pnpm lint
```

Expected: PASS.

```bash
git add src/social test/social src/common/validation test/common/validation src/app.setup.ts package.json pnpm-lock.yaml
git commit -m "refactor: establish social domain and remove dto classes"
```

### Task 7: Enforce architecture boundaries and run the complete gate

**Files:**
- Create: `test/architecture/layer-boundaries.spec.ts`
- Modify: feature modules and tests containing old import paths reported by the architecture test

- [ ] **Step 1: Add a failing architecture test**

Create a Jest test that recursively reads `src/**/*.ts`, extracts relative imports, and reports:

- `domain/**` importing Nest, Zod, Drizzle, Express, `common/http`, application, infrastructure, or
  presentation;
- `application/**` importing infrastructure or presentation;
- `presentation/**` importing infrastructure;
- exported names ending in `Entity` inside `domain/entity`.

Use this complete test structure:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const sourceRoot = resolve(process.cwd(), 'src');

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? typescriptFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

function normalized(path: string): string {
  return path.split(sep).join('/');
}

describe('layer boundaries', () => {
  it('keeps dependencies pointing inward', () => {
    const violations: string[] = [];

    for (const file of typescriptFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      const owner = normalized(relative(sourceRoot, file));
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] ?? '',
      );

      for (const imported of imports) {
        const target = imported.startsWith('.')
          ? normalized(relative(sourceRoot, resolve(dirname(file), imported)))
          : imported;

        if (
          owner.includes('/domain/') &&
          (['@nestjs', 'zod', 'drizzle-orm', 'express'].some((name) =>
            imported.startsWith(name),
          ) ||
            target.startsWith('common/http/') ||
            /\/(application|infrastructure|presentation)\//.test(`/${target}/`))
        ) {
          violations.push(`${owner} -> ${imported}`);
        }
        if (
          owner.includes('/application/') &&
          /\/(infrastructure|presentation)\//.test(`/${target}/`)
        ) {
          violations.push(`${owner} -> ${imported}`);
        }
        if (owner.includes('/presentation/') && target.includes('/infrastructure/')) {
          violations.push(`${owner} -> ${imported}`);
        }
      }

      if (
        owner.includes('/domain/entity/') &&
        /export\s+(?:type|interface|class)\s+\w+Entity\b/.test(source)
      ) {
        violations.push(`${owner} exports an Entity-postfixed name`);
      }
    }

    expect(violations).toEqual([]);
  });
});
```

Run `pnpm test -- --runInBand test/architecture/layer-boundaries.spec.ts` before fixing remaining
imports and confirm it reports the known violations.

- [ ] **Step 2: Remove every remaining boundary violation**

Use:

```bash
rg -n "from ['\"].*(infrastructure|presentation)" src/*/application
rg -n "from ['\"].*(application|infrastructure|presentation|common/http)" src/*/domain
rg -n "createZodDto|nestjs-zod|class .*Request|class .*Query|class .*Param" src test
rg -n "type .*Entity|interface .*Entity|class .*Entity" src/*/domain/entity
```

Expected after corrections: no matches except intentional test descriptions or third-party type
names explicitly allowed by the lint configuration.

- [ ] **Step 3: Run fresh full verification**

```bash
pnpm typecheck
pnpm lint
pnpm test -- --runInBand
pnpm test:db -- --runInBand
pnpm build
```

Expected: every command exits 0 with no new warnings.

- [ ] **Step 4: Commit the architecture gate**

```bash
git add test/architecture/layer-boundaries.spec.ts src test
git commit -m "refactor: enforce layer import boundaries"
```

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git status --short
git diff HEAD~7 --stat
rg -n "createZodDto|nestjs-zod|AppZodValidationPipe" src test package.json
```

Expected: only intentional user-owned pre-existing files remain untracked; the forbidden-pattern
search returns no output.
