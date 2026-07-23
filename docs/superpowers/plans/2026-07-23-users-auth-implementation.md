# Users and Social Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the public Spring-compatible user, consent, metadata, and social-login APIs to the NestJS service with PostgreSQL-backed multi-session authentication.

**Architecture:** `users` owns profiles, jobs, addresses, consent definitions, and user consent state; `auth` owns social identity verification, service JWTs, and `auth_sessions`. The public API keeps existing paths and BaseResponse field names; only the documented temporary email login is removed. PostgreSQL UNIQUE constraints protect identity and token-rotation invariants, while short transactions and conditional updates avoid locks and stale counters.

**Tech Stack:** NestJS 11, TypeScript 5.9, Drizzle ORM + PostgreSQL, `jose`, Node `crypto`, Zod, Vitest, Supertest.

---

## Scope and compatibility decisions

- Preserve `POST /api/auth/login`, `POST /api/auth/{provider}/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/withdraw`, `POST /api/users/join`, profile, consent, and metadata routes.
- Remove only the insecure `POST /api/users/login` email-only login.
- Continue to return `accessToken` and `refreshToken`, and continue to accept refresh tokens in the `RefreshToken` header. `auth_sessions` is an internal session record, not a renamed response field.
- Preserve Spring's unusual legacy combination for `join`, `refresh`, and `withdraw`: HTTP `201`, but BaseResponse body fields `status: "OK"`, `code: "success"`, and the normal success message. Use `@HttpCode(201)` with `successResponse(result)` (without its `CREATED` argument).
- `users.email` is nullable UNIQUE. This retains the existing “same email from another provider requires explicit account linking” behavior without auto-linking accounts. PostgreSQL allows more than one NULL, so Kakao accounts without email remain valid.
- Profile image upload remains unavailable until the Storage implementation. Existing multipart routes remain, but a supplied file fails with `503 Z006`; profile reads return a URL only when a later Storage URL resolver can resolve a saved key.
- This slice implements jobs and addresses. `GET /api/metadata/mogak-categories` and `/colors` are implemented with the Mogaks slice, where their source of truth belongs.

## File map

| Path | Responsibility |
| --- | --- |
| `src/config/app-env.ts` | Validate JWT and social-provider runtime configuration. |
| `src/common/http/app-error-code.ts` | Preserve concrete Spring user/token/storage error codes. |
| `src/database/schema/users.ts` | Drizzle tables for users, metadata, consent, social accounts, and sessions. |
| `src/database/schema/index.ts` | Re-export the schema for Drizzle and repositories. |
| `drizzle/0000_*.sql` | Versioned PostgreSQL schema plus initial public metadata. |
| `src/modules/auth/**` | JWTs, session repository, social identity verifiers, guard, and auth API. |
| `src/modules/users/**` | Metadata, profile, nickname, join, and consent use cases/API. |
| `src/modules/storage/**` | Disabled StoragePort boundary used by profile image routes. |
| `src/app.module.ts` | Register the new modules. |
| `src/**/*.spec.ts`, `test/**/*.spec.ts` | Unit and HTTP contract coverage. |

### Task 1: Add auth configuration and legacy error definitions

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/config/app-env.ts`
- Modify: `src/config/app-env.spec.ts`
- Modify: `test/setup-env.ts`
- Modify: `src/common/http/app-error-code.ts`
- Test: `src/common/http/app-error-code.spec.ts`

- [ ] **Step 1: Write failing environment and error-code tests.**

```ts
it('rejects a JWT secret shorter than 32 characters', () => {
  expect(() => parseAppEnv(baseEnv({ JWT_SECRET: 'too-short' }))).toThrow();
});

it('keeps the existing social-account conflict contract', () => {
  expect(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED).toMatchObject({
    httpStatus: HttpStatus.CONFLICT,
    code: 'U012',
    message: '기존 계정에 소셜 계정 연결이 필요합니다',
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the environment test fails because JWT settings are not parsed.**

Run: `pnpm test src/config/app-env.spec.ts src/common/http/app-error-code.spec.ts`

Expected: FAIL for missing `JWT_SECRET` validation and missing user/token error definitions.

- [ ] **Step 3: Add `jose`, secure environment parsing, and only the required legacy error codes.**

Add `"jose": "^6.1.3"` to `dependencies`, then install with the pinned pnpm version. Extend the environment schema with these required values:

```ts
JWT_SECRET: z.string().min(32),
APPLE_CLIENT_IDS: z.string().min(1),
GOOGLE_CLIENT_IDS: z.string().min(1),
```

Document only variable names in `.env.example`; never add a usable secret. Set deterministic non-secret test values in `test/setup-env.ts`.

Add exact legacy definitions used by this slice: `U001`–`U016`, `T001`–`T005`, and `Z006`. For example:

```ts
SOCIAL_ACCOUNT_LINK_REQUIRED: {
  httpStatus: HttpStatus.CONFLICT,
  code: 'U012',
  message: '기존 계정에 소셜 계정 연결이 필요합니다',
},
LOGOUT_TOKEN: {
  httpStatus: HttpStatus.FORBIDDEN,
  code: 'T005',
  message: '로그아웃된 토큰입니다',
},
STORAGE_DISABLED: {
  httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
  code: 'Z006',
  message: '스토리지 기능이 비활성화되어 있습니다',
},
```

- [ ] **Step 4: Run formatting and focused tests.**

Run: `pnpm format:check && pnpm test src/config/app-env.spec.ts src/common/http/app-error-code.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the isolated configuration change.**

```bash
git add package.json pnpm-lock.yaml .env.example src/config src/common/http test/setup-env.ts
git commit -m "feat: add authentication configuration contract"
```

### Task 2: Define the user/auth schema and generate the first migration

**Files:**
- Create: `src/database/schema/users.ts`
- Modify: `src/database/schema/index.ts`
- Create: `drizzle/0000_users_auth.sql`
- Create: `drizzle/meta/0000_snapshot.json`
- Create: `drizzle/meta/_journal.json`
- Modify: `package.json`
- Test: `src/database/schema/users.spec.ts`

- [ ] **Step 1: Write a schema contract test before adding tables.**

```ts
it('uses bigint relational IDs, nullable unique user identity fields, and a UUID session ID', () => {
  expect(users.id.dataType).toBe('number');
  expect(users.email.notNull).toBe(false);
  expect(authSessions.id.dataType).toBe('string');
  expect(userConsents.userId.notNull).toBe(true);
});
```

Also assert the named UNIQUE constraints: `users_nickname_unique`, `users_email_unique`, `consent_items_code_unique`, `user_consents_user_item_unique`, `social_accounts_provider_user_unique`, and `social_accounts_user_provider_unique`.

- [ ] **Step 2: Run the test and verify it fails because the schema exports do not exist.**

Run: `pnpm test src/database/schema/users.spec.ts`

Expected: FAIL with an import/export error.

- [ ] **Step 3: Add `src/database/schema/users.ts` using only correctness constraints.**

Use `bigint(..., { mode: 'number' }).generatedByDefaultAsIdentity()` for relational IDs, `uuid().defaultRandom()` for sessions, `timestamp(..., { withTimezone: true })` for timestamps, and `onDelete: 'cascade'` only for user-owned rows. The schema must contain:

```ts
export const users = pgTable(
  'users',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jobId: bigint('job_id', { mode: 'number' }).references(() => jobs.id),
    addressId: bigint('address_id', { mode: 'number' }).references(() => addresses.id),
    nickname: varchar('nickname', { length: 255 }).unique(),
    email: varchar('email', { length: 255 }).unique(),
    gender: varchar('gender', { length: 1 }),
    age: integer('age'),
    role: varchar('role', { length: 32 }).notNull().default('PENDING'),
    profileImageKey: varchar('profile_image_key', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);
```

Create `jobs`, `addresses`, `consentItems`, `userConsents`, `socialAccounts`, and `authSessions` in the same file. Use these named UNIQUE constraints:

```ts
unique('user_consents_user_item_unique').on(table.userId, table.consentItemId)
unique('social_accounts_provider_user_unique').on(table.provider, table.providerUserId)
unique('social_accounts_user_provider_unique').on(table.userId, table.provider)
```

`user_consents`, `social_accounts`, and `auth_sessions` reference `users` with `onDelete: 'cascade'`. Consent definitions remain when users are deleted. Do not add CHECK constraints, PostgreSQL enums, `deleted_at`, soft-delete partial uniques, `slot` columns, or speculative indexes.

- [ ] **Step 4: Export the schema and generate the migration.**

```ts
export * from './users';
```

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak pnpm db:generate`

Review the generated SQL. It must contain the FK cascade and named UNIQUE constraints but no manual `CREATE INDEX`, no CHECK, and no `deleted_at` column.

- [ ] **Step 5: Add public initial metadata to the generated migration.**

Append data inserts for the Spring public seed's jobs, addresses (including `경기도`), and active consent items `MARKETING`, `ADVERTISEMENT`, and `NOTIFICATION`. Migration execution is tracked by Drizzle, so do not add artificial runtime seeding or duplicate-prevention indexes. Keep the original public names exactly.

- [ ] **Step 6: Verify static schema and migration content.**

Run: `pnpm test src/database/schema/users.spec.ts && pnpm typecheck && rg 'CREATE INDEX|CHECK|deleted_at' drizzle src/database/schema`

Expected: tests/typecheck pass; the ripgrep command prints no migration/schema matches.

- [ ] **Step 7: Commit schema and migration together.**

```bash
git add src/database/schema drizzle package.json
git commit -m "feat: add users and auth session schema"
```

### Task 3: Implement signed service tokens and conditional session rotation

**Files:**
- Create: `src/modules/auth/domain/authenticated-user.ts`
- Create: `src/modules/auth/domain/token-pair.ts`
- Create: `src/modules/auth/infrastructure/token.service.ts`
- Create: `src/modules/auth/infrastructure/token.service.spec.ts`
- Create: `src/modules/auth/infrastructure/auth-sessions.repository.ts`
- Create: `src/modules/auth/infrastructure/auth-sessions.repository.spec.ts`
- Create: `src/modules/auth/auth.module.ts`

- [ ] **Step 1: Write the token tests first.**

```ts
it('puts the user, role, access token type, and session ID in access tokens', async () => {
  const tokens = await service.issue({ userId: 7, email: 'a@b.test', role: 'USER', sessionId: SID });
  await expect(service.verifyAccess(tokens.accessToken)).resolves.toMatchObject({
    userId: 7,
    role: 'USER',
    sessionId: SID,
  });
});

it('rejects an access token at the refresh-token boundary', async () => {
  const tokens = await service.issue({ userId: 7, role: 'USER', sessionId: SID });
  await expect(service.verifyRefresh(tokens.accessToken)).rejects.toMatchObject({
    errorCode: AppErrorCode.WRONG_TOKEN,
  });
});
```

For the session repository, inject a fake Drizzle executor and assert that rotation emits one `UPDATE` with session ID, old hash, and `expires_at > now` in its predicate; it must return a boolean based on `RETURNING id`.

- [ ] **Step 2: Run focused tests and verify they fail.**

Run: `pnpm test src/modules/auth/infrastructure/token.service.spec.ts src/modules/auth/infrastructure/auth-sessions.repository.spec.ts`

Expected: FAIL because the auth classes do not exist.

- [ ] **Step 3: Implement `TokenService` with `jose`.**

Use HS256 with UTF-8 bytes of `JWT_SECRET`, access TTL 900 seconds, refresh TTL 2,678,400 seconds, and `clockTolerance: 30`. Keep Spring-compatible claims and add the internal session ID:

```ts
type AccessClaims = {
  userId: number;
  email?: string;
  role: 'PENDING' | 'USER';
  sessionId: string;
};

// JWT payload: sub=String(userId), id=userId, role, token_type='access', sid=sessionId, optional email
// refresh payload: sub=String(userId), token_type='refresh', sid=sessionId
```

Convert `sub`, `id`, and `sid` defensively; reject unsafe integer IDs, absent claims, bad signature, expired JWT, and the wrong `token_type` with the existing `T001`/`T002` contract. Hash the raw refresh JWT using `createHash('sha256').update(token).digest('hex')`; never log or persist the raw value.

- [ ] **Step 4: Implement `AuthSessionsRepository` without locking.**

Expose `create`, `findActiveById`, `deleteByIdAndUserId`, `deleteByUserId`, and `rotate`. `rotate` must use one conditional Drizzle update equivalent to:

```sql
UPDATE auth_sessions
SET refresh_token_hash = $next_hash, expires_at = $next_expiry, updated_at = now()
WHERE id = $session_id
  AND refresh_token_hash = $old_hash
  AND expires_at > now()
RETURNING id;
```

No preliminary `SELECT`, no `FOR UPDATE`, and no retry that accepts an already used refresh token.

- [ ] **Step 5: Run focused tests and typecheck.**

Run: `pnpm test src/modules/auth/infrastructure/token.service.spec.ts src/modules/auth/infrastructure/auth-sessions.repository.spec.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the token/session boundary.**

```bash
git add src/modules/auth
git commit -m "feat: add signed session-bound tokens"
```

### Task 4: Verify social identities and implement social login/refresh/logout/withdraw

**Files:**
- Create: `src/modules/auth/domain/social-provider.ts`
- Create: `src/modules/auth/domain/social-identity.ts`
- Create: `src/modules/auth/domain/social-identity-verifier.port.ts`
- Create: `src/modules/auth/infrastructure/apple-identity-verifier.ts`
- Create: `src/modules/auth/infrastructure/google-identity-verifier.ts`
- Create: `src/modules/auth/infrastructure/kakao-identity-verifier.ts`
- Create: `src/modules/auth/infrastructure/social-identity-verifier.registry.ts`
- Create: `src/modules/auth/application/auth.service.ts`
- Create: `src/modules/auth/application/auth.service.spec.ts`
- Create: `src/modules/auth/presentation/auth.controller.ts`
- Create: `src/modules/auth/presentation/auth.controller.spec.ts`
- Modify: `src/modules/auth/auth.module.ts`

- [ ] **Step 1: Write social and auth-service tests before adapters.**

```ts
it('creates a PENDING user and one session for a new verified Google identity', async () => {
  verifier.verify.mockResolvedValue(googleIdentity({ emailVerified: true }));
  await expect(service.login('google', 'id-token')).resolves.toMatchObject({ isRegistered: false });
  expect(users.createPending).toHaveBeenCalledWith('google@example.test');
  expect(socialAccounts.create).toHaveBeenCalledWith(expect.objectContaining({ provider: 'GOOGLE' }));
});

it('does not link an identity merely because its email already belongs to another user', async () => {
  users.findByEmail.mockResolvedValue(existingUser);
  await expect(service.login('kakao', 'access-token')).rejects.toMatchObject({
    errorCode: AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED,
  });
});

it('allows a new Kakao identity without email but rejects new Apple and Google identities without verified email', async () => {
  // Kakao resolves; Apple/Google reject with U010 or U013.
});
```

The controller test must assert these exact contracts:

```ts
await request(app.getHttpServer())
  .post('/api/auth/apple/login')
  .send({ token: 'google-style-token' })
  .expect(400)
  .expect(({ body }) => expect(body.code).toBe('U009'));

await request(app.getHttpServer())
  .post('/api/auth/refresh')
  .set('RefreshToken', refreshToken)
  .expect(201)
  .expect(({ body }) => expect(body).toMatchObject({ status: 'OK', code: 'success' }));
```

- [ ] **Step 2: Run the tests and confirm missing imports/classes fail.**

Run: `pnpm test src/modules/auth/application/auth.service.spec.ts src/modules/auth/presentation/auth.controller.spec.ts`

Expected: FAIL because identity verifier and service modules do not exist.

- [ ] **Step 3: Implement production identity verifiers behind one port.**

Use:

```ts
export type SocialProvider = 'APPLE' | 'GOOGLE' | 'KAKAO';
export type SocialIdentity = Readonly<{
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}>;
export interface SocialIdentityVerifier {
  supports(provider: SocialProvider): boolean;
  verify(token: string): Promise<SocialIdentity>;
}
```

Apple verifies RS256 against `https://appleid.apple.com/auth/keys`, issuer `https://appleid.apple.com`, and one of comma-separated `APPLE_CLIENT_IDS`. Google verifies RS256 against `https://www.googleapis.com/oauth2/v3/certs`, issuer `https://accounts.google.com`, and one of `GOOGLE_CLIENT_IDS`. Both use `jwtVerify(..., { clockTolerance: 30 })` and normalize boolean/string `email_verified`. Kakao calls `GET https://kapi.kakao.com/v2/user/me` with `Authorization: Bearer <token>`, a three-second `AbortSignal.timeout`, and maps `id`, `kakao_account.email`, `is_email_valid`, and `is_email_verified`.

Do not call any verifier inside a database transaction. Translate malformed or rejected provider data to `U008`/`U009`/`U010`/`U013`; never include upstream body text in the API response.

- [ ] **Step 4: Implement login and session commands.**

`AuthService.login` resolves the external identity first, then performs the following short transaction:

1. Find `social_accounts(provider, provider_user_id)`.
2. For an existing account, issue a new independent `auth_sessions` record and token pair for its user.
3. For a new account, validate provider ID and email policy, reject an existing `users.email` with `U012`, create a `PENDING` user, then create the social account and session.
4. Convert PostgreSQL `23505` for the email collision to `U012`, and provider identity collision to a reread of that social account followed by normal login.

`refresh` verifies the refresh JWT, hashes the presented raw JWT, creates a new pair for the same session ID, then calls `rotate`. Return `T001` when the conditional update returns no row. `logout` deletes only `(session_id, user_id)`. `withdraw` deletes `users.id`; FK cascades delete sessions, social accounts, consents, and future owned data without a manual deletion sequence.

- [ ] **Step 5: Implement public auth routes.**

```ts
@Post('login')
async loginApple(@Body('id_token') idToken: string) {
  return successResponse(await this.authService.login('APPLE', idToken));
}

@Post(':provider/login')
async loginSocial(@Param('provider') provider: string, @Body('token') token: string) {
  return successResponse(await this.authService.login(parseSocialProvider(provider), token));
}

@Post('refresh')
@HttpCode(HttpStatus.CREATED)
async refresh(@Headers('refreshtoken') refreshToken: string) {
  return successResponse(await this.authService.refresh(refreshToken));
}
```

Attach the access guard to logout and withdraw. Keep only the `isRegistered`, `userId`, and nested `tokens` response fields. Keep the `AuthWithdrawResponse` field as `isDeleted`.

- [ ] **Step 6: Run all auth unit/API tests.**

Run: `pnpm test src/modules/auth test/health.e2e.spec.ts && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the auth slice.**

```bash
git add src/modules/auth src/common/http src/app.module.ts
git commit -m "feat: add social authentication sessions"
```

### Task 5: Add the authenticated-user guard and request decorator

**Files:**
- Create: `src/modules/auth/presentation/access-token.guard.ts`
- Create: `src/modules/auth/presentation/current-user.decorator.ts`
- Create: `src/modules/auth/presentation/access-token.guard.spec.ts`
- Modify: `src/modules/auth/auth.module.ts`

- [ ] **Step 1: Write guard tests.**

```ts
it('puts verified access claims on request.user when the referenced session is active', async () => {
  tokens.verifyAccess.mockResolvedValue({ userId: 3, role: 'USER', sessionId: SID });
  sessions.findActiveById.mockResolvedValue({ id: SID, userId: 3 });
  await expect(guard.canActivate(context)).resolves.toBe(true);
  expect(request.user).toEqual({ userId: 3, role: 'USER', sessionId: SID });
});

it('returns T005 after the current session has been logged out', async () => {
  sessions.findActiveById.mockResolvedValue(null);
  await expect(guard.canActivate(context)).rejects.toMatchObject({
    errorCode: AppErrorCode.LOGOUT_TOKEN,
  });
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run: `pnpm test src/modules/auth/presentation/access-token.guard.spec.ts`

Expected: FAIL with missing guard/decorator imports.

- [ ] **Step 3: Implement bearer parsing and active-session validation.**

The guard accepts only `Authorization: Bearer <access JWT>`, calls `TokenService.verifyAccess`, then `AuthSessionsRepository.findActiveById`. It verifies that the row's `userId` equals the claim and `expiresAt` is in the future. Missing/malformed headers return `T003`/`T001`; an absent or expired session returns `T005`. It uses a primary-key lookup only—no lock, no token database storage, and no broad user lookup.

The decorator returns `AuthenticatedUser` from `request.user`:

```ts
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>().user,
);
```

- [ ] **Step 4: Run the guard test and typecheck.**

Run: `pnpm test src/modules/auth/presentation/access-token.guard.spec.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the guard.**

```bash
git add src/modules/auth
git commit -m "feat: validate active authentication sessions"
```

### Task 6: Implement users, metadata, and consent commands

**Files:**
- Create: `src/modules/users/infrastructure/users.repository.ts`
- Create: `src/modules/users/infrastructure/metadata.repository.ts`
- Create: `src/modules/users/infrastructure/consents.repository.ts`
- Create: `src/modules/users/application/user.service.ts`
- Create: `src/modules/users/application/consent.service.ts`
- Create: `src/modules/users/application/metadata.service.ts`
- Create: `src/modules/users/presentation/user.controller.ts`
- Create: `src/modules/users/presentation/consent.controller.ts`
- Create: `src/modules/users/presentation/metadata.controller.ts`
- Create: `src/modules/users/users.module.ts`
- Create: `src/modules/users/**/*.spec.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write service tests for user-state and consent rules.**

```ts
it('allows a nickname only when it is 2–10 characters and unused', async () => {
  repositories.users.existsByNickname.mockResolvedValue(false);
  await expect(service.verifyNickname('모각러')).resolves.toBeUndefined();
});

it('rejects duplicate consent IDs before issuing any upsert', async () => {
  await expect(consentService.update(7, [agree(1, true), agree(1, false)])).rejects.toMatchObject({
    errorCode: AppErrorCode.DUPLICATE_CONSENT_ITEM,
  });
});

it('updates a pending user, saves consent state, replaces the pending session, and returns USER tokens', async () => {
  await expect(userService.join(currentPendingUser, joinRequest)).resolves.toMatchObject({
    nickname: '모각러',
    tokens: expect.any(Object),
  });
  expect(sessions.deleteByIdAndUserId).toHaveBeenCalledWith(currentPendingUser.sessionId, 7, expect.anything());
});
```

- [ ] **Step 2: Run the tests and verify they fail.**

Run: `pnpm test src/modules/users`

Expected: FAIL because users/consents/metadata modules do not exist.

- [ ] **Step 3: Implement repositories with explicit, narrow methods.**

Do not add a base repository. Implement methods such as `findById`, `findByEmail`, `existsByNickname`, `createPending`, `completeRegistration`, `updateNickname`, `updateJob`, `findProfile`, `listJobs`, `listAddresses`, `listActiveConsentItems`, `findConsentItemsByIds`, and `upsertUserConsent`.

Every `id` read from a route, claim, or Drizzle result must pass:

```ts
export function asSafeId(value: string | number): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppException(AppErrorCode.INVALID_PARAMETER);
  return id;
}
```

Use `onConflictDoUpdate` on `user_consents(user_id, consent_item_id)`. Set `agreedAt` only on agreement and `withdrawnAt` only on withdrawal. Never create an append-only history table in this slice.

- [ ] **Step 4: Implement user and consent application rules.**

`join` requires a current `PENDING` user, validates nickname/job/address/active consent IDs, and in one short transaction:

1. Updates the user to `USER` with nickname, job ID, and address ID.
2. Upserts supplied consent states and rejects absent required active consent items.
3. Creates a replacement session/token pair for role `USER`.
4. Deletes the current PENDING session by `(sessionId, userId)`.

On nickname uniqueness race, translate PostgreSQL `23505` to `U004`. Do not lock the user or metadata rows. `getMarketingConsent` and `patchMarketingConsent` address only the `MARKETING` and `ADVERTISEMENT` consent item codes; if no row exists, return `false` and create/update the row on patch.

- [ ] **Step 5: Implement API controllers and DTO validation.**

Keep exact request/response field names:

```ts
class JoinRequest {
  @IsString() @Length(2, 10) nickname!: string;
  @IsString() @Length(1, 100) job!: string;
  @IsString() @Length(1, 100) address!: string;
  @IsOptional() @ValidateNested({ each: true }) consents?: ConsentAgreementRequest[];
}

class ConsentAgreementRequest {
  @IsInt() @IsPositive() consentItemId!: number;
  @IsBoolean() agreed!: boolean;
}
```

- `POST /api/users/nickname/verify`: plain success envelope.
- `POST /api/users/join`: current access guard, `201` HTTP with ordinary success envelope, returns `{ userId, nickname, tokens }`.
- `GET /api/users/profile`: returns `{ nickname, job, imgUrl }`.
- `PUT /api/users/profile/nickname` and `/job`: plain success envelope.
- `GET /api/consents`: returns active `{ id, code, name, description, required }` values.
- `GET|PATCH /api/users/marketing-consent` and `PUT /api/users/consents`: retain current request/response shapes.
- `GET /api/metadata/jobs` and `/addresses`: return `{ name }[]`.
- Do not define `POST /api/users/login`.

- [ ] **Step 6: Add Supertest contract coverage with replaced repositories/services.**

```ts
await request(app.getHttpServer())
  .post('/api/users/nickname/verify')
  .send({ nickname: '모각러' })
  .expect(200)
  .expect(({ body }) => expect(body).toMatchObject({ status: 'OK', code: 'success' }));

await request(app.getHttpServer())
  .post('/api/users/login')
  .send({ email: 'unsafe@example.test' })
  .expect(404);
```

Also cover validation failure `Z005`, profile response key `imgUrl`, and marketing patch with neither field rejected as `Z005`.

- [ ] **Step 7: Run user tests, lint, and build.**

Run: `pnpm test src/modules/users && pnpm lint && pnpm typecheck && pnpm build`

Expected: PASS.

- [ ] **Step 8: Commit the user/metadata/consent slice.**

```bash
git add src/modules/users src/app.module.ts test
git commit -m "feat: add user profiles and consent APIs"
```

### Task 7: Preserve profile-image routes behind a disabled StoragePort

**Files:**
- Create: `src/modules/storage/application/storage.port.ts`
- Create: `src/modules/storage/infrastructure/disabled-storage.adapter.ts`
- Create: `src/modules/storage/storage.module.ts`
- Create: `src/modules/storage/infrastructure/disabled-storage.adapter.spec.ts`
- Modify: `src/modules/users/presentation/user.controller.ts`
- Modify: `src/modules/users/users.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write the failing disabled-storage test.**

```ts
it('returns the existing 503 storage-disabled error for an upload attempt', async () => {
  await expect(storage.uploadProfile(file)).rejects.toMatchObject({
    errorCode: AppErrorCode.STORAGE_DISABLED,
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `pnpm test src/modules/storage/infrastructure/disabled-storage.adapter.spec.ts`

Expected: FAIL because the storage port/adapter does not exist.

- [ ] **Step 3: Implement a small port and disabled adapter.**

```ts
export interface StoragePort {
  uploadProfile(file: Express.Multer.File): Promise<{ storageKey: string }>;
  replaceProfile(previousKey: string | null, file: Express.Multer.File): Promise<{ storageKey: string }>;
  deleteProfile(storageKey: string): Promise<void>;
  resolvePublicUrl(storageKey: string): Promise<string | null>;
}
```

The disabled adapter throws `Z006` for every mutation and returns `null` from `resolvePublicUrl`. Register it via an injection token. Do not store a URL in `users`; retain only `profile_image_key` for a future serverless/signed-upload implementation.

- [ ] **Step 4: Wire existing multipart routes without pretending upload works.**

Use `FileInterceptor('multipartFile')` for `PUT /api/users/profile/image`; an empty file clears the saved key, a supplied file reaches the disabled port and returns `503 Z006`. On join, accept optional `multipartFile`; do not call storage when omitted. The route's public response stays a normal success envelope only when no upload is requested.

- [ ] **Step 5: Run storage/user HTTP tests.**

Run: `pnpm test src/modules/storage src/modules/users && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the Storage boundary.**

```bash
git add src/modules/storage src/modules/users src/app.module.ts
git commit -m "feat: add disabled profile storage boundary"
```

### Task 8: Run database verification and update the handoff

**Files:**
- Create: `test/database/users-auth.integration.spec.ts`
- Create: `test/database/setup.ts`
- Modify: `package.json`
- Modify: `docs/migration/2026-07-23-nestjs-migration-handoff.md`

- [ ] **Step 1: Write PostgreSQL-only integration tests.**

The setup must fail clearly when `DATABASE_URL` is absent; it must never silently use a production database. Against a dedicated disposable test database, run Drizzle migrations and test:

```ts
it('hard-deletes sessions, social accounts, and consent rows when a user is withdrawn', async () => {
  const user = await fixture.createUserWithSessionAndConsent();
  await usersRepository.deleteById(user.id);
  await expect(fixture.countRowsForUser(user.id)).resolves.toEqual({
    users: 0, sessions: 0, socialAccounts: 0, userConsents: 0,
  });
});

it('accepts only one conditional refresh rotation for the same raw refresh token', async () => {
  const results = await Promise.allSettled([refresh(token), refresh(token)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
});
```

- [ ] **Step 2: Add an explicit integration command.**

Add `"test:db": "vitest run test/database"`. The test setup must require `DATABASE_URL` whose database name ends in `_test`; it then runs `pnpm db:migrate` before fixtures. Do not add a test that binds an external port.

- [ ] **Step 3: Run the complete non-database gate.**

Run: `pnpm test && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`

Expected: PASS.

- [ ] **Step 4: Run database tests only with an explicit disposable PostgreSQL URL.**

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak_test pnpm test:db`

Expected: PASS. If no disposable PostgreSQL instance is available, do not claim this passed; record the exact unavailable dependency in the handoff and keep the command runnable in CI.

- [ ] **Step 5: Update documentation and commit the final slice.**

Mark users/auth as implemented in the handoff. Record that database tests are either passed with the exact command or pending only because a disposable PostgreSQL service was unavailable; do not claim production verification.

```bash
git add test/database package.json docs/migration
git commit -m "test: verify users and authentication persistence"
```

## Self-review

- Public contract coverage is scoped to existing auth/users/consent/metadata paths, with the explicitly approved removal of email-only login. The approved DailyJogak and feed changes are not introduced early.
- The schema has no CHECK constraints, no soft delete, no archive/trash model, no pre-emptive performance indexes, no artificial cap slots, and no locking query.
- Required correctness constraints are named and testable: email/nickname, consent user-item, social provider identity/user-provider, and session primary key.
- Login external calls occur before database transactions. Session refresh uses an atomic conditional update; logout checks only the active session by primary key; hard deletion relies on FK cascades.
- `auth_sessions`, external `refreshToken`, `isRegistered`, `imgUrl`, and `RefreshToken` are used consistently throughout the tasks.
