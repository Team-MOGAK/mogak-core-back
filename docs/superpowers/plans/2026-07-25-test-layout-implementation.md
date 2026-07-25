# Test Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all unit and package-scoped HTTP tests out of `src/` into a domain-mirroring `test/` tree without changing runtime behavior.

**Architecture:** Production code remains under `src/`. Tests mirror each production package under `test/`; application-wide HTTP tests remain under `test/e2e/`, and database integration tests remain under `test/database/`. Jest discovers only `test/**/*.spec.ts` for its normal suite.

**Tech Stack:** TypeScript, NestJS, Jest, ts-jest, pnpm.

---

### Task 1: Establish the test-discovery boundary

**Files:**
- Modify: `jest.config.ts`
- Test: `test/common/http/global-exception.filter.spec.ts`

- [ ] **Step 1: Change the normal Jest matcher to `test/**/*.spec.ts` only.**

```ts
testMatch: ['<rootDir>/test/**/*.spec.ts'],
```

- [ ] **Step 2: Run `pnpm test -- global-exception.filter.spec.ts` and verify it fails because the existing test remains under `src/`.**

- [ ] **Step 3: Move all `src/**/*.spec.ts` files to the matching `test/**` path and update each relative import so it points back to the corresponding file below `src/`.**

```text
src/auth/application/auth.service.spec.ts
  -> test/auth/application/auth.service.spec.ts
src/common/http/global-exception.filter.spec.ts
  -> test/common/http/global-exception.filter.spec.ts
```

- [ ] **Step 4: Run `pnpm test -- global-exception.filter.spec.ts` and verify it passes from its new path.**

### Task 2: Separate application-wide E2E tests

**Files:**
- Move: `test/health.e2e.spec.ts` to `test/e2e/health.e2e.spec.ts`
- Move: `test/rate-limit.e2e.spec.ts` to `test/e2e/rate-limit.e2e.spec.ts`
- Test: `test/e2e/health.e2e.spec.ts`

- [ ] **Step 1: Move the two application-wide tests into `test/e2e/` without changing their assertions.**

- [ ] **Step 2: Update their relative imports from `../src/...` to `../../src/...`.**

- [ ] **Step 3: Run `pnpm test -- e2e/health.e2e.spec.ts` and verify the test is discovered at the new location.**

### Task 3: Verify the final layout

**Files:**
- Modify: `jest.config.ts`
- Modify: moved test files only

- [ ] **Step 1: Confirm no `src/**/*.spec.ts` files remain.**

```bash
rg --files src -g '*.spec.ts'
```

- [ ] **Step 2: Run targeted tests, `pnpm typecheck`, and `pnpm lint`.**

- [ ] **Step 3: Run `pnpm test` and `pnpm build`; use an environment that permits local HTTP port binding for E2E tests.**

- [ ] **Step 4: Review the diff, ensure `.pnpm-store/` remains untracked, and commit the layout refactor separately.**
