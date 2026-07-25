# Repository Persistence Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep database details in repositories, replace persistence-path `Error` values with explicit exceptions, and preserve the two-stage authentication account/session flow.

**Architecture:** Repositories translate driver failures and impossible persistence results into a domain-scoped `*PersistenceException`. A service catches only a small set of explicit duplicate-conflict exceptions that it can turn into a business response or recover from. Expected absence and idempotency remain normal return values.

**Tech Stack:** NestJS 11, TypeScript 5.9, Drizzle ORM, PostgreSQL, Jest.

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/auth/domain/exception/auth-persistence.exception.ts` | Auth repository failure and auth uniqueness-race exception types. |
| `src/users/domain/exception/user-persistence.exception.ts` | User repository failure and duplicate nickname exception types. |
| `src/mogaks/domain/exception/mogaks-persistence.exception.ts` | Explicit failures while writing or decoding Mogaks records. |
| `src/posts/domain/exception/posts-persistence.exception.ts` | Explicit failures while creating posts and comments. |
| `src/*/infrastructure/repository/*.repository.ts` | Translate persistence-only failures; never leak driver details. |
| `src/auth/application/service/auth.service.ts` | Handle only auth uniqueness races and issue sessions after account persistence. |
| `src/users/application/service/user.service.ts` | Handle only `DuplicateNicknameException`; remove PostgreSQL inspection. |
| `test/auth/**`, `test/users/**`, `test/posts/**`, `test/mogaks/**` | Prove exception translation and application-facing behavior. |

### Task 1: Define explicit Auth persistence exceptions

**Files:**
- Modify: `src/auth/domain/exception/auth-persistence.exception.ts`
- Test: `test/auth/infrastructure/auth.repository.spec.ts`
- Test: `test/auth/infrastructure/auth-sessions.repository.spec.ts`

- [ ] **Step 1: Write failing repository exception tests.**

```ts
it('converts the email unique constraint into an auth conflict exception', async () => {
  const verifiedIdentity = {
    provider: 'GOOGLE' as const,
    providerUserId: 'google-subject',
    email: 'mogak@example.test',
    emailVerified: true,
  };
  const duplicate = Object.assign(new Error('duplicate'), {
    code: '23505',
    constraint: 'users_email_unique',
  });
  const db = { transaction: testMock().mockRejectedValue(duplicate) } as unknown as Database;

  await expect(new AuthRepository(db).createAccount(verifiedIdentity)).rejects.toBeInstanceOf(
    DuplicateEmailException,
  );
});

it('converts a missing returned session row into AuthPersistenceException', async () => {
  const returning = testMock().mockResolvedValue([]);
  const repository = new AuthSessionsRepository({
    insert: testMock().mockReturnValue({ values: testMock().mockReturnValue({ returning }) }),
  } as unknown as Database);

  await expect(
    repository.create({
      id: 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f',
      userId: 7,
      refreshTokenHash: 'refresh-token-hash',
      expiresAt: new Date('2026-08-25T00:00:00.000Z'),
    }),
  ).rejects.toBeInstanceOf(AuthPersistenceException);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail because the exception behavior is absent or incomplete.**

Run: `pnpm test --runInBand test/auth/infrastructure/auth.repository.spec.ts test/auth/infrastructure/auth-sessions.repository.spec.ts`

Expected: FAIL with a missing test file and/or an unexpected generic error.

- [ ] **Step 3: Implement the exception hierarchy and auth translation.**

Keep `AuthPersistenceException` as the generic storage-boundary failure; do not introduce a catch-all `AuthException`. Preserve a cause for unexpected failures and leave specific conflicts meaningful:

```ts
export class AuthPersistenceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthPersistenceException';
  }
}

export class DuplicateEmailException extends AuthPersistenceException {
  constructor() {
    super('A user with this email already exists');
    this.name = 'DuplicateEmailException';
  }
}
```

In `AuthRepository.createAccount`, retain the transaction that atomically inserts `users` and
`socialAccounts`. Inside its `catch`, first rethrow an existing `AuthPersistenceException`, then
map only `users_email_unique` and `social_accounts_provider_user_unique`, and finally throw:

```ts
throw new AuthPersistenceException('Failed to create auth account', { cause: error });
```

Use `AuthPersistenceException` for missing rows and unsupported persisted roles. Make
`AuthSessionsRepository.create` use the same type for its missing-row invariant.

- [ ] **Step 4: Run the focused tests and verify they pass.**

Run: `pnpm test --runInBand test/auth/infrastructure/auth.repository.spec.ts test/auth/infrastructure/auth-sessions.repository.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the isolated Auth exception boundary.**

```bash
git add src/auth/domain/exception/auth-persistence.exception.ts \
  src/auth/infrastructure/repository/auth.repository.ts \
  src/auth/infrastructure/repository/auth-sessions.repository.ts \
  test/auth/infrastructure/auth.repository.spec.ts \
  test/auth/infrastructure/auth-sessions.repository.spec.ts
git commit -m "refactor: isolate auth persistence failures"
```

### Task 2: Preserve the two-stage Auth account/session contract

**Files:**
- Modify: `src/auth/application/port/auth-persistence.port.ts`
- Modify: `src/auth/application/service/auth.service.ts`
- Modify: `src/auth/application/type/auth.command.ts`
- Modify: `src/auth/application/type/auth.result.ts`
- Modify: `src/auth/auth.module.ts`
- Test: `test/auth/application/auth.service.spec.ts`

- [ ] **Step 1: Write failing service tests for the direct identity contract and conflict handling.**

```ts
it('passes the verified identity directly to account persistence before creating a session', async () => {
  const identity = {
    provider: 'GOOGLE' as const,
    providerUserId: 'google-subject',
    email: 'mogak@example.test',
    emailVerified: true,
  };
  const pendingUser = { id: 7, email: identity.email, nickname: null, role: 'PENDING' as const };
  jest.mocked(persistence.createAccount).mockResolvedValue(pendingUser);

  await service.login('GOOGLE', 'id-token');

  expect(persistence.createAccount).toHaveBeenCalledWith(identity);
  expect(persistence.createSession).toHaveBeenCalledWith(
    pendingUser.id,
    expect.objectContaining({ id: expect.any(String), refreshTokenHash: 'refresh-token-hash' }),
  );
});

it('maps DuplicateEmailException without reading a PostgreSQL error', async () => {
  jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
  jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
  jest.mocked(persistence.createAccount).mockRejectedValue(new DuplicateEmailException());

  await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
    new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED),
  );
});
```

- [ ] **Step 2: Run the focused service test and verify it fails against the former callback API.**

Run: `pnpm test --runInBand test/auth/application/auth.service.spec.ts`

Expected: FAIL if `createAccount` still requires `{ identity }` or a session callback, or if it
does not recognize `DuplicateEmailException`.

- [ ] **Step 3: Implement the direct two-stage flow.**

Define the port as:

```ts
createAccount(identity: VerifiedSocialIdentity): Promise<AuthUser>;
```

Remove `AccountCreationCommand` and `SessionIssueResult` if they are now unused. In `login`, call
`createAccount(identity)` and then `issueSession(newUser)`. `issueSession` generates the ID, asks
the token issuer for tokens, and persists `{ id, refreshTokenHash, expiresAt }` through
`createSession`. Keep the duplicate social-account race recovery, but catch only
`DuplicateSocialAccountException`; do not inspect `code`, `constraint`, or a driver type.

Rename any `DrizzleAuthRepository` provider binding to `AuthRepository`, and remove callback-only
session-ID injection from the module and service constructor.

- [ ] **Step 4: Run the focused service test and typecheck.**

Run: `pnpm test --runInBand test/auth/application/auth.service.spec.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the Auth service contract change.**

```bash
git add src/auth/application src/auth/auth.module.ts test/auth/application/auth.service.spec.ts
git commit -m "refactor: separate auth account persistence from session issuance"
```

### Task 3: Move nickname constraint interpretation into UserRepository

**Files:**
- Create: `src/users/domain/exception/user-persistence.exception.ts`
- Modify: `src/users/infrastructure/repository/user.repository.ts`
- Modify: `src/users/application/service/user.service.ts`
- Test: `test/users/infrastructure/user.repository.spec.ts`
- Test: `test/users/application/user.service.spec.ts`

- [ ] **Step 1: Write failing tests for repository translation and service behavior.**

```ts
it('maps users_nickname_unique to DuplicateNicknameException', async () => {
  const duplicate = Object.assign(new Error('duplicate'), {
    code: '23505',
    constraint: 'users_nickname_unique',
  });
  const repository = new UserRepository({
    update: testMock().mockImplementation(() => {
      throw duplicate;
    }),
  } as unknown as Database);

  await expect(repository.updateNickname({
    userId: 7,
    nickname: '모각러',
    now: new Date('2026-07-25T00:00:00.000Z'),
  })).rejects.toBeInstanceOf(
    DuplicateNicknameException,
  );
});

it('returns INVALID_NICKNAME when the repository reports a duplicate nickname', async () => {
  jest.mocked(users.updateNickname).mockRejectedValue(new DuplicateNicknameException());

  await expect(service.updateNickname(7, '모각러')).rejects.toEqual(
    new DomainException(AppErrorCode.INVALID_NICKNAME),
  );
});
```

- [ ] **Step 2: Run the focused tests and verify they fail because the service still reads driver fields.**

Run: `pnpm test --runInBand test/users/infrastructure/user.repository.spec.ts test/users/application/user.service.spec.ts`

Expected: FAIL with no repository exception translation or an unhandled duplicate exception.

- [ ] **Step 3: Implement the User persistence boundary.**

Create `UserPersistenceException` with the same `ErrorOptions` cause support as Auth and a
`DuplicateNicknameException` subtype. In `UserRepository`, map `users_nickname_unique` inside
both `completeRegistration` and `updateNickname`. Convert a missing registration row and an
unsupported persisted user role to `UserPersistenceException`.

Replace `isNicknameUniqueViolation` in `UserService` with `error instanceof
DuplicateNicknameException`. Remove the helper entirely, leaving `verifyNickname` as the
preflight check and the repository conflict as the race-safe authoritative check.

- [ ] **Step 4: Run the focused tests and verify they pass.**

Run: `pnpm test --runInBand test/users/infrastructure/user.repository.spec.ts test/users/application/user.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the User exception boundary.**

```bash
git add src/users/domain/exception/user-persistence.exception.ts \
  src/users/infrastructure/repository/user.repository.ts \
  src/users/application/service/user.service.ts \
  test/users/infrastructure/user.repository.spec.ts \
  test/users/application/user.service.spec.ts
git commit -m "refactor: isolate user persistence conflicts"
```

### Task 4: Replace Mogaks and Posts persistence-path generic errors

**Files:**
- Create: `src/mogaks/domain/exception/mogaks-persistence.exception.ts`
- Modify: `src/mogaks/infrastructure/repository/mogaks.repository.ts`
- Create: `src/posts/domain/exception/posts-persistence.exception.ts`
- Modify: `src/posts/infrastructure/repository/posts.repository.ts`
- Test: `test/mogaks/infrastructure/mogaks.repository.spec.ts`
- Test: `test/posts/infrastructure/posts.repository.spec.ts`

- [ ] **Step 1: Write failing invariant tests.**

```ts
it('reports a missing created Modarat row as MogaksPersistenceException', async () => {
  const returning = testMock().mockResolvedValue([]);
  const repository = new MogaksRepository({
    insert: testMock().mockReturnValue({ values: testMock().mockReturnValue({ returning }) }),
  } as unknown as Database);

  await expect(repository.createModarat({ userId: 7, title: '운동', color: null })).rejects.toBeInstanceOf(
    MogaksPersistenceException,
  );
});

it('reports a missing created comment row as PostsPersistenceException', async () => {
  const repository = new PostsRepository({
    insert: testMock().mockReturnValue({
      values: testMock().mockReturnValue({ returning: testMock().mockResolvedValue([]) }),
    }),
  } as unknown as Database);

  await expect(repository.createComment({ postId: 31, authorId: 7, contents: '좋은 회고네요' })).rejects.toBeInstanceOf(
    PostsPersistenceException,
  );
});
```

- [ ] **Step 2: Run the focused tests and verify they fail with generic `Error`.**

Run: `pnpm test --runInBand test/mogaks/infrastructure/mogaks.repository.spec.ts test/posts/infrastructure/posts.repository.spec.ts`

Expected: FAIL with `Error` rather than a persistence exception.

- [ ] **Step 3: Implement explicit invariant failures without changing port semantics.**

Add simple `MogaksPersistenceException` and `PostsPersistenceException` classes with optional
causes. Replace only repository `new Error(...)` persistence-path failures:

- missing inserted Modarat, Mogak, Jogak, schedule, or comment rows;
- a category that disappears immediately after a successful Mogak insert;
- missing execution after the conflict-safe execution lookup;
- invalid stored execution status, schedule type, weekday, or user-facing post record needed by a
  successful write.

Do not change normal `null`, `false`, `DUPLICATE`, or `INVALID_EFFECTIVE_FROM` outcomes: those
are already application-port behavior, not errors.

- [ ] **Step 4: Run the focused tests and the existing service suites.**

Run: `pnpm test --runInBand test/mogaks/infrastructure/mogaks.repository.spec.ts test/posts/infrastructure/posts.repository.spec.ts test/mogaks/application test/posts/application`

Expected: PASS.

- [ ] **Step 5: Commit the Mogaks and Posts exception changes.**

```bash
git add src/mogaks/domain/exception src/mogaks/infrastructure/repository/mogaks.repository.ts \
  src/posts/domain/exception src/posts/infrastructure/repository/posts.repository.ts \
  test/mogaks/infrastructure test/posts/infrastructure
git commit -m "refactor: name mogaks and posts persistence failures"
```

### Task 5: Eliminate remaining repository generic errors and verify boundaries

**Files:**
- Modify: `src/users/infrastructure/repository/consent.repository.ts`
- Test: `test/users/infrastructure/consent.repository.spec.ts`
- Test: `test/architecture/layer-boundaries.spec.ts`

- [ ] **Step 1: Write a failing test for the inactive-consent persistence invariant.**

```ts
it('reports inactive marketing consent configuration with a named user persistence exception', async () => {
  const repository = new ConsentRepository({
    select: testMock().mockReturnValue({
      from: testMock().mockReturnValue({
        where: testMock().mockResolvedValue([{ id: 1, code: 'MARKETING', active: false }]),
      }),
    }),
  } as unknown as Database);

  await expect(
    repository.updateMarketingConsents(
      7,
      { marketingAgreed: true },
      new Date('2026-07-25T00:00:00.000Z'),
    ),
  ).rejects.toBeInstanceOf(
    UserPersistenceException,
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails with generic `Error`.**

Run: `pnpm test --runInBand test/users/infrastructure/consent.repository.spec.ts`

Expected: FAIL with `Error: marketing consent item is not active`.

- [ ] **Step 3: Replace the final repository generic error and add a source-boundary regression check.**

Replace the inactive marketing-consent generic error with `UserPersistenceException`, because a
required persisted consent definition is unavailable. Extend the architecture test to read the
application service sources and assert that they do not contain PostgreSQL unique-violation
literals:

```ts
expect(readFileSync('src/auth/application/service/auth.service.ts', 'utf8')).not.toMatch(
  /23505|users_email_unique|social_accounts_provider_user_unique/,
);
expect(readFileSync('src/users/application/service/user.service.ts', 'utf8')).not.toMatch(
  /23505|users_nickname_unique/,
);
```

Do not add unused `SocialPersistenceException`: `SocialRepository` has no explicit persistence
invariant or driver-error branch to translate in this change.

- [ ] **Step 4: Run the repository audit and all relevant tests.**

Run: `rg -n "new Error\\(" src --glob '*repository*.ts'`

Expected: no output.

Run: `pnpm test --runInBand test/architecture/layer-boundaries.spec.ts test/auth test/users test/mogaks test/posts`

Expected: PASS.

- [ ] **Step 5: Commit the audit completion.**

```bash
git add src/users/infrastructure/repository/consent.repository.ts \
  test/users/infrastructure/consent.repository.spec.ts \
  test/architecture/layer-boundaries.spec.ts
git commit -m "test: enforce repository persistence boundaries"
```

### Task 6: Run the final quality gate

**Files:**
- Verify only.

- [ ] **Step 1: Run formatting, static checks, unit tests, and the build.**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test --runInBand && pnpm build`

Expected: every command exits with status 0.

- [ ] **Step 2: Inspect the final diff and working-tree ownership.**

Run: `git diff --check && git status --short && git log --oneline -6`

Expected: no whitespace errors; only intentional files are staged or committed; pre-existing user
changes remain untouched unless they are part of the requested persistence refactor.

- [ ] **Step 3: Commit any formatter-only changes if needed.**

```bash
git add src test
git commit -m "style: format persistence boundary changes"
```

Skip this step when formatting produces no changes.
