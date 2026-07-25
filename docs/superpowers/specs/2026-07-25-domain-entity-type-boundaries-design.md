# Domain Entity and Type Boundaries Design

## Context

The current codebase mixes runtime Nest classes, HTTP request validation, application inputs,
domain rules, persistence commands, database records, and response projections in the same files.
Several services import concrete infrastructure classes and database record types directly. Request
contracts are implemented as `createZodDto()` subclasses even though Zod already provides both the
runtime schema and the static TypeScript type.

The refactor will make database-backed domain entities the center of each feature while preserving
the existing API, database schema, and observable behavior.

## Goals

- Represent every database entity with a persistence-independent domain type.
- Keep the rules belonging to an entity in the same domain module as that entity.
- Use explicit layer-specific names such as `Request`, `Response`, `Command`, `Query`, `Result`,
  `Record`, and `Projection`.
- Remove every DTO class and every use of `createZodDto`.
- Make Zod schemas the runtime request contract and infer static request types from those schemas.
- Prevent presentation and application code from depending on infrastructure types.
- Keep files cohesive without creating one file per small type.
- Preserve endpoint paths, status codes, error codes, response JSON, and database behavior.

## Non-goals

- Changing the public API contract.
- Changing the Drizzle schema or creating a database migration.
- Introducing a generic base entity, repository, command bus, or query bus.
- Turning every domain entity into a class.
- Creating speculative value objects or policies that are not required by current rules.
- Replacing the existing application error mapping in the same refactor.

## Core Design Decisions

### 1. Database entities are the domain baseline

Every database table has a corresponding domain entity representation. Drizzle row types remain
infrastructure records and are not reused as domain entities.

Closely related child entities may share one entity module with their owning concept. This avoids a
file per table while still representing every table explicitly.

| Domain module | Domain types | Database tables |
| --- | --- | --- |
| `auth/domain/entity/auth.entity.ts` | `SocialAccount`, `AuthSession` | `social_accounts`, `auth_sessions` |
| `users/domain/entity/user.entity.ts` | `User` | `users` |
| `users/domain/entity/user-metadata.entity.ts` | `Job`, `Address` | `jobs`, `addresses` |
| `users/domain/entity/consent.entity.ts` | `ConsentItem`, `UserConsent` | `consent_items`, `user_consents` |
| `mogaks/domain/entity/modarat.entity.ts` | `Modarat` | `modarats` |
| `mogaks/domain/entity/mogak.entity.ts` | `Mogak`, `MogakCategory` | `mogaks`, `mogak_categories` |
| `mogaks/domain/entity/jogak.entity.ts` | `Jogak`, `JogakSchedule`, `JogakScheduleWeekday`, `JogakExecution` | `jogaks`, `jogak_schedules`, `jogak_schedule_weekdays`, `jogak_executions` |
| `posts/domain/entity/post.entity.ts` | `Post`, `PostImage`, `PostComment`, `PostLike` | `posts`, `post_images`, `post_comments`, `post_likes` |
| `social/domain/entity/follow.entity.ts` | `Follow` | `follows` |

Entity filenames use the `.entity.ts` suffix. Exported entity names do not repeat the `Entity`
suffix:

```ts
// posts/domain/entity/post.entity.ts
export type Post = Readonly<{
  id: number;
  jogakExecutionId: number;
  authorId: number;
  contents: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PostComment = Readonly<{
  id: number;
  postId: number;
  authorId: number;
  contents: string;
  createdAt: Date;
  updatedAt: Date;
}>;
```

### 2. Entity rules stay with the entity

Rules start in the entity module whose state they govern:

- `auth.entity.ts`: session activity, expiry, and rotation eligibility.
- `user.entity.ts`: registration state transition and nickname normalization rules.
- `consent.entity.ts`: duplicate selection, active item, and required consent rules.
- `modarat.entity.ts`: ownership and Mogak capacity.
- `mogak.entity.ts`: category selection and Jogak capacity.
- `jogak.entity.ts`: schedule validation, weekday rules, occurrence calculation, execution status
  transition, and execution title snapshot behavior.
- `post.entity.ts`: post and comment content limits, ownership, occurrence uniqueness, and like
  state.
- `follow.entity.ts`: self-follow and duplicate relation rules.

Rules are expressed as functions operating on readonly entity values unless state encapsulation
provides a concrete benefit. Domain entity classes are allowed only when they enforce invariants
that cannot be maintained reliably with readonly values and factory functions. DTOs, records,
commands, queries, and responses never become classes.

### 3. Value objects are extracted only when justified

An entity-related value begins in the owning entity module. It moves to a `.vo.ts` file only when
at least one of these conditions is true:

- multiple entities share it;
- it represents an independent category or value-table concept;
- the value itself has substantial invariants;
- its rules and tests change independently from the owning entity.

`JogakSchedule` is not a value object because it has its own database identity and history. It is a
domain entity in `jogak.entity.ts`.

Potential value objects such as category selection, date-only values, or social providers are
extracted only if the implementation demonstrates one of the conditions above. Token pairs are
application results, not value objects.

### 4. Each layer is subdivided by artifact role

Feature and layer directories are not sufficient on their own. Each layer uses role-specific
subdirectories so that types, services, ports, repositories, and controllers do not accumulate in
one directory. The project will not introduce feature-wide `types.ts`, `models.ts`, or `dto.ts`
files.

```text
posts/
├── domain/
│   ├── entity/
│   │   └── post.entity.ts
│   └── vo/                    # only when a value object is justified
├── application/
│   ├── type/
│   │   ├── post.command.ts
│   │   ├── post.query.ts
│   │   └── post.result.ts
│   ├── port/
│   │   ├── post.repository.port.ts
│   │   └── owned-occurrence.port.ts
│   └── service/
│       └── posts.service.ts
├── infrastructure/
│   ├── type/
│   │   ├── post.record.ts
│   │   └── post.projection.ts
│   └── repository/
│       └── posts.repository.ts
└── presentation/
    ├── type/
    │   ├── posts.request.ts
    │   └── posts.response.ts
    └── controller/
        └── posts.controller.ts
```

Subdirectory names are singular: `entity`, `vo`, `type`, `service`, `port`, `repository`, and
`controller`. Infrastructure may add an equally explicit role directory such as `verifier` for
provider-specific identity verification. Empty directories are not created. Small features may use
fewer contract files, but every artifact still resides in its role-specific directory and retains
its semantic suffix. Files split when they contain independent responsibilities or become
difficult to understand as one unit, not merely because another type was added.

## Layer Contracts and Naming

### Presentation

- Request body: `CreatePostRequest`
- Path parameters: `PostCommentParams`
- HTTP query input: `PostPageQueryRequest`
- Response payload: `PostResponse`
- Runtime schema: `createPostRequestSchema`

Presentation types are inferred from Zod schemas:

```ts
export const createPostRequestSchema = z
  .object({
    targetDate: calendarDateSchema,
    contents: requiredTextSchema(1, 350),
  })
  .strict();

export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;
```

Controllers convert validated presentation requests into application commands or queries and map
application results into response types. A response type is not reused as an application result.

### Application

- State-changing input: `CreatePostCommand`
- Read input: `GetPostQuery`
- Use-case output: `CreatePostResult`, `PostDetailResult`
- External capability: `PostRepositoryPort`, `TokenIssuerPort`, `SocialIdentityVerifierPort`

Application contracts live under `application/type` and contain use-case language rather than HTTP
or database terminology. Application services live under `application/service` and may depend on
domain modules and application ports. They may not import infrastructure classes, records, or
projections.

Cross-feature collaboration also uses narrow application contracts. For example, Posts obtains an
owned occurrence through `OwnedOccurrencePort`; it does not inject `JogaksService` as a concrete
dependency.

### Infrastructure

- Database row: `PostRecord`
- Joined or aggregated read row: `PostDetailProjection`
- Persistence mutation input: `InsertPostCommand`
- Persistence read input: `FindOwnedPostQuery`
- Persistence branch result: `InsertPostResult`

Infrastructure Records and Projections live under `infrastructure/type`; repository adapters live
under `infrastructure/repository`. Adapters implement application ports and map Drizzle rows to
domain entities for entity-based operations. Read-heavy endpoints may use projections, but those
projections remain inside infrastructure and are mapped to the port's read result before crossing
the boundary.

### Domain

Entity types use natural domain names:

- `Post`
- `PostComment`
- `Jogak`
- `JogakSchedule`
- `AuthSession`

Entity files live under `domain/entity`. The `Entity` postfix is prohibited on exported entity
types because the file suffix and directory already communicate their role.

## Request Validation Without DTO Classes

`createZodDto` and `nestjs-zod` are removed. Schema-aware parameter decorators connect a Zod schema
directly to Nest:

```ts
async createPost(
  @ZodParams(jogakParamsSchema) params: JogakParams,
  @ZodBody(createPostRequestSchema) request: CreatePostRequest,
): Promise<ApiResponse<CreatePostResponse>> {
  // map request to command
}
```

The validation adapter provides `ZodBody`, `ZodQuery`, and `ZodParams`. Each decorator invokes a
schema-specific pipe and converts validation failures to the existing
`DomainException(AppErrorCode.INVALID_PARAMETER)`. TypeScript types are erased at runtime, so the
schema is always supplied explicitly rather than discovered through a DTO class metatype.

Multipart requests retain explicit Zod parsing. Their raw transport shape is represented with a
type or schema, never a DTO class.

When all request contracts are migrated, the global `AppZodValidationPipe` and the `nestjs-zod`
dependency are removed.

## Data Flow

### Command flow

```text
HTTP payload
  -> Zod Request
  -> Controller mapping
  -> Application Command
  -> Domain Entity rules
  -> Repository Port
  -> Infrastructure Command
  -> Drizzle Record
```

Each transition is explicit. Structural similarity does not justify reusing a type from another
layer.

### Query flow

```text
HTTP query
  -> Zod QueryRequest
  -> Application Query
  -> Repository Port
  -> Infrastructure Projection
  -> Application Result
  -> Presentation Response
```

Query projections do not need to be reconstructed as entities when no entity behavior is applied.
The corresponding domain entity still exists as the persistence-independent representation of its
database entity.

## Dependency Direction

The allowed direction is:

```text
Presentation -> Application -> Domain
                         |
                         v
                 Application Port
                         ^
                         |
                  Infrastructure
```

Required corrections include:

- move auth persistence and social identity verifier ports out of `auth/domain` and into
  `auth/application/port`;
- replace application imports of concrete repositories and `TokenService` with ports;
- prevent guards from importing `AuthSessionsRepository` or token infrastructure directly;
- replace Posts' concrete dependencies on `MogaksService` and `JogaksService` with narrow
  application ports;
- prevent repository `Record` and `Projection` types from appearing in service signatures;
- keep Nest, Zod, Drizzle, Express, and HTTP exception types out of domain modules.

Architecture restrictions are enforced with lint rules or an equivalent import-boundary test so
that domain cannot import outward and application cannot import infrastructure or presentation.

## Error Handling

Domain rules expose explicit success or failure outcomes without importing HTTP concerns. The
application layer translates those failures into the existing `AppErrorCode` and
`DomainException`, preserving current API behavior.

Persistence failures remain infrastructure failures unless an application port explicitly models
them as a branch result, such as duplicate creation or optimistic transition conflict.

Unexpected persisted values produce internal errors at the infrastructure-to-domain mapping
boundary. They are not silently coerced into valid domain values.

Renaming or replacing the existing HTTP-bound `DomainException` is outside this refactor. The
important boundary is that domain modules no longer import or throw it.

## Migration Strategy

The change is implemented feature by feature to avoid a repository-wide big-bang rewrite:

1. Add schema-aware request decorators and migrate presentation request contracts away from DTO
   classes.
2. Add domain entity modules mapped to all current database entities.
3. Move existing rules from services into the corresponding entity modules with characterization
   tests preserving behavior.
4. Introduce application Commands, Queries, Results, and Ports.
5. Split infrastructure Records and Projections from repository implementations and add explicit
   mapping.
6. Remove cross-layer imports and concrete cross-feature service dependencies.
7. Add architectural import restrictions.
8. Remove `createZodDto`, the global DTO-metatype validation pipe, and `nestjs-zod`.

Within each feature, tests are written or adjusted before production changes. Existing endpoint
behavior remains green after every migration slice.

## Testing Strategy

### Domain tests

Test entity rules as pure functions:

- user registration state transition;
- consent duplicate, active, and required-item validation;
- Modarat and Mogak capacity;
- Mogak category selection;
- Jogak schedule creation and replacement;
- date occurrence and status derivation;
- Jogak execution transitions and title snapshots;
- post and comment content normalization and limits;
- post/comment ownership;
- self-follow rejection.

### Presentation tests

Test each request schema and schema-aware parameter decorator for:

- valid coercion;
- unknown-field rejection;
- invalid body, query, and path handling;
- conversion to `INVALID_PARAMETER`;
- multipart JSON parsing.

Controller tests verify Request-to-Command and Result-to-Response mapping rather than DTO class
construction.

### Application tests

Service tests use application port fakes. They verify orchestration, domain failure mapping,
transaction branch handling, and cross-feature port interaction without importing infrastructure
records.

### Infrastructure tests

Repository integration tests verify:

- Drizzle Record-to-Entity mapping;
- Projection-to-port-result mapping;
- persisted enum and status validation;
- transaction behavior and uniqueness branches.

### Verification

The complete refactor must pass:

```bash
pnpm typecheck
pnpm lint
pnpm test -- --runInBand
pnpm test:db -- --runInBand
pnpm build
```

## Acceptance Criteria

- Every database table listed in the schema has a corresponding domain entity type.
- Entity modules live under `domain/entity` and use `.entity.ts`; exported entity types do not use
  the `Entity` postfix.
- Entity rules live with their entity unless an independently cohesive VO or policy justifies a
  split.
- No DTO class or `createZodDto` usage remains.
- `nestjs-zod` is removed when no longer used.
- Request and response contracts live under `presentation/type`.
- Controllers live under `presentation/controller`.
- Commands, Queries, and Results live under `application/type`.
- Services and Ports live under `application/service` and `application/port`, respectively.
- Records and Projections live under `infrastructure/type`; repositories live under
  `infrastructure/repository`.
- Domain imports no framework, validation, persistence, or HTTP modules.
- Application imports no infrastructure or presentation modules.
- API behavior and database schema remain unchanged.
- Unit, integration, typecheck, lint, and build verification pass.
