# Camel-Case TypeScript Filenames Design

## Goal

Make TypeScript filenames consistent with the team's preferred `camelCase` convention while preserving the existing role suffix convention and all runtime behavior.

## Scope

Rename every tracked TypeScript source and test filename that contains a kebab-case compound name. Update every relative module specifier that references a renamed file.

Examples:

- `access-token.guard.ts` becomes `accessToken.guard.ts`.
- `social-identity-verifier.registry.spec.ts` becomes `socialIdentityVerifier.registry.spec.ts`.
- `rate-limit.e2e.spec.ts` becomes `rateLimit.e2e.spec.ts`.

The final role suffixes remain dot-delimited: `.controller.ts`, `.service.ts`, `.entity.ts`, `.port.ts`, `.spec.ts`, and `.e2e.spec.ts`.

## Non-goals

- Do not rename classes, functions, variables, directories, npm scripts, database schema names, or API fields.
- Do not change runtime behavior or refactor module boundaries.
- Do not touch pre-existing untracked files: `.pnpm-store/` and `src/database/schema/common.ts`.
- Do not introduce a new filename-lint dependency or policy rule in this change.

## Approach

Use Git-aware renames so history follows each file where possible. Convert only the basename segments separated by hyphens to lower camel case; leave the extension and dot-separated role suffixes unchanged. Then update exact relative imports and test imports using the same mapping.

The work is atomic from a source perspective: no source file may retain a reference to an old kebab-case filename after the rename. Existing public import behavior is not a compatibility concern because this repository is an application, and all references are internal.

## Validation

1. Search for stale kebab-case module specifiers after the migration; only non-module string data such as multipart filenames may remain.
2. Run `pnpm typecheck`.
3. Run `pnpm lint`.
4. Run `pnpm test` and `pnpm test:e2e`.
5. Review Git status to confirm the change set contains only intended renames and import updates, excluding the user's existing untracked files.

## Risks and Mitigations

Case-sensitive filesystems can expose imports whose spelling does not exactly match their files. The type check and full test suites detect these resolution failures. Git-aware renames prevent accidental delete-and-add operations and make review clearer.
