# Repository Persistence Boundary Design

## Goal

Keep PostgreSQL- and ORM-specific failures inside repository implementations so application services consume only domain-meaningful persistence exceptions. At the same time, simplify authentication account creation into independent persistence and session-issuance stages.

## Scope

This change covers production repository implementations in `auth`, `users`, `mogaks`, `posts`, and `social`, plus application services that currently interpret database error details. Configuration validation and test fixture failures are out of scope.

## Exception boundaries

Each repository-facing domain receives an explicit persistence exception type, such as
`AuthPersistenceException`, `UserPersistenceException`, `MogaksPersistenceException`,
`PostsPersistenceException`, or `SocialPersistenceException`. These types express an unexpected
storage-boundary failure; they are not catch-all `AuthException`-style domain exception families.

Repository methods convert unexpected database-driver failures, missing rows following a successful
write, and invalid persisted enum values to their domain's persistence exception. The original
error is retained as the cause when available. Application services do not handle these generic
persistence failures; the global exception boundary reports them as server failures.

Business-relevant uniqueness races are represented by specific exceptions only where an application
service must branch. The repository alone inspects PostgreSQL error code `23505` and constraint
names. The initial cases are duplicate social email, duplicate social identity, and duplicate
nickname. Application services catch only these precise conflict exceptions; they never inspect
error codes or constraint identifiers.

Expected absence and idempotency remain part of each port contract (`null`, `false`, or an explicit result union) and are not turned into exceptions.

## Authentication flow

`AuthPersistencePort.createAccount` accepts `VerifiedSocialIdentity` directly and returns the newly created `AuthUser`. The account and social identity are committed atomically in the repository transaction.

After that transaction succeeds, `AuthService` issues JWTs and persists the session in a separate operation. The repository has no token-issuance callback and the service does not pass a redundant `{ identity }` wrapper. A token/session persistence failure can no longer roll back an already-created account, which makes the two responsibilities explicit.

Repository implementation names remain domain-oriented (`AuthRepository`, `UserRepository`, and so on) without ORM or driver prefixes.

## Testing

Tests will first prove that:

1. a repository maps a recognized unique-constraint driver error to its domain-specific exception;
2. an unexpected persistence failure becomes the domain persistence exception with its cause;
3. services map only domain-specific duplicate exceptions to API/domain errors;
4. account creation receives `VerifiedSocialIdentity` directly and session issuance occurs after account persistence.

Existing behavioral tests for idempotent operations and missing resources remain unchanged.

## Non-goals

- Replacing validation or configuration `Error` usage that is outside a persistence boundary.
- Changing API response contracts for unknown persistence failures.
- Retrying failed writes or compensating account creation after session persistence fails.
