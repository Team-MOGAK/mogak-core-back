# NestJS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Create a runnable NestJS service with the existing HTTP envelope, validated runtime configuration, a PostgreSQL/Drizzle boundary, and an externally reachable health endpoint.

**Architecture:** Start with a single NestJS application using the Express adapter. The database module exposes a typed Drizzle client over node-postgres, but creates no product tables or migrations; the next vertical plan adds users and auth.

**Tech Stack:** Node.js 24, TypeScript, NestJS, Express, PostgreSQL, Drizzle ORM, node-postgres, Zod, Vitest, Supertest, pnpm.

---

## Scope

This is the first of four implementation plans:

1. Foundation: runtime, common HTTP contract, PostgreSQL boundary, health endpoint.
2. Users and auth: users, metadata, consents, social accounts, auth sessions, JWT.
3. Mogaks: Modarat, Mogak, Jogak, virtual occurrences, executions.
4. Posts, social, storage boundary, contract tests, and query evidence.

Do not create product tables, soft delete, DailyJogak, CHECK constraints, indexes, slots, or locks in this plan.

## File map

~~~text
package.json
pnpm-lock.yaml
.nvmrc
.gitignore
.env.example
nest-cli.json
tsconfig.json
tsconfig.build.json
eslint.config.mjs
prettier.config.mjs
vitest.config.ts
drizzle.config.ts

src/main.ts
src/app.module.ts
src/app.setup.ts
src/config/app-env.ts
src/config/config.module.ts
src/common/http/app-error-code.ts
src/common/http/api-response.ts
src/common/http/app.exception.ts
src/common/http/all-exceptions.filter.ts
src/database/database.tokens.ts
src/database/database.provider.ts
src/database/database.module.ts
src/database/schema/index.ts
src/health/health.controller.ts
src/health/health.module.ts

src/common/http/api-response.spec.ts
src/config/app-env.spec.ts
test/setup-env.ts
test/health.e2e-spec.ts
~~~

### Task 1: Initialize the package and toolchain

**Files:**

- Create: package.json, .nvmrc, .gitignore, .env.example
- Create: nest-cli.json, tsconfig.json, tsconfig.build.json
- Create: eslint.config.mjs, prettier.config.mjs, vitest.config.ts

- [ ] **Step 1: Add the package manifest**

Create package.json:

~~~json
{
  "name": "mogak-core-back",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "engines": {
    "node": ">=24.18.0 <25",
    "pnpm": ">=10.32.1 <11"
  },
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:e2e": "vitest run test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
~~~

Install runtime packages:

~~~bash
pnpm add @nestjs/common @nestjs/config @nestjs/core @nestjs/platform-express class-transformer class-validator dotenv drizzle-orm pg reflect-metadata rxjs zod
~~~

Install development packages:

~~~bash
pnpm add -D @eslint/js @nestjs/cli @nestjs/schematics @nestjs/testing @types/express @types/node @types/pg @types/supertest drizzle-kit eslint prettier supertest ts-node typescript typescript-eslint vitest
~~~

- [ ] **Step 2: Add reproducible project configuration**

Create .nvmrc:

~~~text
24.18.0
~~~

Create .env.example:

~~~dotenv
NODE_ENV=development
PORT=8080
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak
~~~

Create .gitignore:

~~~gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
~~~

Create nest-cli.json:

~~~json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
~~~

Create tsconfig.json:

~~~json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2023",
    "declaration": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "sourceMap": true,
    "outDir": "./dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
~~~

Create tsconfig.build.json:

~~~json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
~~~

Create eslint.config.mjs:

~~~js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'drizzle/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);
~~~

Create prettier.config.mjs:

~~~js
export default {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100
};
~~~

Create vitest.config.ts:

~~~ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    restoreMocks: true
  }
});
~~~

- [ ] **Step 3: Verify installation**

Run:

~~~bash
pnpm exec tsc --version
pnpm exec nest --version
pnpm exec vitest --version
~~~

Expected: every command exits with status 0.

- [ ] **Step 4: Commit the baseline**

~~~bash
git add package.json pnpm-lock.yaml .nvmrc .gitignore .env.example nest-cli.json tsconfig.json tsconfig.build.json eslint.config.mjs prettier.config.mjs vitest.config.ts
git commit -m "chore: initialize NestJS foundation"
~~~

### Task 2: Preserve the shared HTTP envelope

**Files:**

- Create: src/common/http/app-error-code.ts
- Create: src/common/http/api-response.ts
- Create: src/common/http/app.exception.ts
- Create: src/common/http/all-exceptions.filter.ts
- Test: src/common/http/api-response.spec.ts

- [ ] **Step 1: Write a failing contract test**

Create src/common/http/api-response.spec.ts:

~~~ts
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AppErrorCode } from './app-error-code';
import { errorResponse, successResponse } from './api-response';

describe('HTTP response builders', () => {
  it('keeps the Spring success envelope', () => {
    expect(successResponse({ id: 1 }, HttpStatus.CREATED, new Date('2026-07-23T00:00:00Z'))).toEqual({
      time: '2026-07-23 09:00:00',
      status: 'CREATED',
      code: 'created',
      message: '요청에 성공했으며 리소스가 정상적으로 생성되었습니다.',
      result: { id: 1 }
    });
  });

  it('does not include result for an error', () => {
    expect(errorResponse(AppErrorCode.INVALID_PARAMETER, new Date('2026-07-23T00:00:00Z'))).toEqual({
      time: '2026-07-23 09:00:00',
      status: 'BAD_REQUEST',
      code: 'Z005',
      message: '입력값이 유효하지 않습니다'
    });
  });
});
~~~

- [ ] **Step 2: Verify the test fails**

Run:

~~~bash
pnpm test src/common/http/api-response.spec.ts
~~~

Expected: FAIL because the common HTTP modules do not exist.

- [ ] **Step 3: Implement builders, typed exceptions, and the filter**

Create src/common/http/app-error-code.ts:

~~~ts
import { HttpStatus } from '@nestjs/common';

export type ErrorDefinition = Readonly<{
  httpStatus: HttpStatus;
  code: string;
  message: string;
}>;

export const AppErrorCode = {
  BAD_REQUEST: { httpStatus: HttpStatus.BAD_REQUEST, code: 'Z002', message: '잘못된 요청입니다' },
  INVALID_PARAMETER: { httpStatus: HttpStatus.BAD_REQUEST, code: 'Z005', message: '입력값이 유효하지 않습니다' },
  UNAUTHORIZED: { httpStatus: HttpStatus.UNAUTHORIZED, code: 'T001', message: '잘못된 형식의 토큰입니다' },
  FORBIDDEN: { httpStatus: HttpStatus.FORBIDDEN, code: 'T004', message: '권한이 부여되지 않았습니다' },
  NOT_FOUND: { httpStatus: HttpStatus.NOT_FOUND, code: 'Z003', message: '찾을 수 없습니다' },
  CONFLICT: { httpStatus: HttpStatus.CONFLICT, code: 'Z002', message: '잘못된 요청입니다' },
  METHOD_NOT_ALLOWED: { httpStatus: HttpStatus.METHOD_NOT_ALLOWED, code: 'Z004', message: '지원하지 않는 HTTP Method 요청입니다.' },
  INTERNAL_SERVER_ERROR: { httpStatus: HttpStatus.INTERNAL_SERVER_ERROR, code: 'Z500', message: '서버와의 연결에 실패했습니다' }
} as const satisfies Record<string, ErrorDefinition>;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];
~~~

Create src/common/http/api-response.ts:

~~~ts
import { HttpStatus } from '@nestjs/common';

import type { AppErrorCode } from './app-error-code';

export type ApiResponse<T> = {
  time: string;
  status: string;
  code: string;
  message: string;
  result?: T;
};

const kstFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function timestamp(clock: Date): string {
  return kstFormatter.format(clock).replace(',', '');
}

export function successResponse<T>(
  result: T,
  httpStatus: HttpStatus = HttpStatus.OK,
  clock: Date = new Date()
): ApiResponse<T> {
  const created = httpStatus === HttpStatus.CREATED;
  return {
    time: timestamp(clock),
    status: HttpStatus[httpStatus],
    code: created ? 'created' : 'success',
    message: created ? '요청에 성공했으며 리소스가 정상적으로 생성되었습니다.' : '요청에 성공했습니다.',
    result
  };
}

export function errorResponse(error: AppErrorCode, clock: Date = new Date()): ApiResponse<never> {
  return {
    time: timestamp(clock),
    status: HttpStatus[error.httpStatus],
    code: error.code,
    message: error.message
  };
}
~~~

Create src/common/http/app.exception.ts:

~~~ts
import { HttpException } from '@nestjs/common';

import type { AppErrorCode } from './app-error-code';

export class AppException extends HttpException {
  constructor(readonly errorCode: AppErrorCode) {
    super(errorCode.message, errorCode.httpStatus);
  }
}
~~~

Create src/common/http/all-exceptions.filter.ts:

~~~ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { AppErrorCode, type AppErrorCode as AppErrorDefinition } from './app-error-code';
import { AppException } from './app.exception';
import { errorResponse } from './api-response';

function errorForStatus(status: number): AppErrorDefinition {
  if (status === HttpStatus.NOT_FOUND) return AppErrorCode.NOT_FOUND;
  if (status === HttpStatus.UNAUTHORIZED) return AppErrorCode.UNAUTHORIZED;
  if (status === HttpStatus.FORBIDDEN) return AppErrorCode.FORBIDDEN;
  if (status === HttpStatus.CONFLICT) return AppErrorCode.CONFLICT;
  if (status === HttpStatus.METHOD_NOT_ALLOWED) return AppErrorCode.METHOD_NOT_ALLOWED;
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return AppErrorCode.INTERNAL_SERVER_ERROR;
  return AppErrorCode.BAD_REQUEST;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error =
      exception instanceof AppException
        ? exception.errorCode
        : exception instanceof HttpException
          ? errorForStatus(exception.getStatus())
          : AppErrorCode.INTERNAL_SERVER_ERROR;

    response.status(error.httpStatus).json(errorResponse(error));
  }
}
~~~

- [ ] **Step 4: Verify the contract**

Run:

~~~bash
pnpm test src/common/http/api-response.spec.ts
~~~

Expected: two passing tests.

- [ ] **Step 5: Commit**

~~~bash
git add src/common/http
git commit -m "feat: add shared HTTP response contract"
~~~

### Task 3: Add validated configuration and the Drizzle provider boundary

**Files:**

- Create: src/config/app-env.ts
- Create: src/config/config.module.ts
- Create: src/database/database.tokens.ts
- Create: src/database/database.provider.ts
- Create: src/database/database.module.ts
- Create: src/database/schema/index.ts
- Create: drizzle.config.ts
- Test: src/config/app-env.spec.ts

- [ ] **Step 1: Write failing environment tests**

Create src/config/app-env.spec.ts:

~~~ts
import { describe, expect, it } from 'vitest';

import { parseAppEnv } from './app-env';

describe('parseAppEnv', () => {
  it('uses safe development defaults', () => {
    expect(parseAppEnv({ DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak' })).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak'
    });
  });

  it('fails before bootstrap without DATABASE_URL', () => {
    expect(() => parseAppEnv({})).toThrow('DATABASE_URL');
  });
});
~~~

- [ ] **Step 2: Verify the parser test fails**

Run:

~~~bash
pnpm test src/config/app-env.spec.ts
~~~

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement environment and database modules**

Create src/config/app-env.ts:

~~~ts
import { z } from 'zod';

const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url()
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(env: Record<string, string | undefined>): AppEnv {
  return appEnvSchema.parse(env);
}
~~~

Create src/config/config.module.ts:

~~~ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { parseAppEnv } from './app-env';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: parseAppEnv })]
})
export class AppConfigModule {}
~~~

Create src/database/database.tokens.ts:

~~~ts
export const PG_POOL = Symbol('PG_POOL');
export const DATABASE = Symbol('DATABASE');
~~~

Create src/database/schema/index.ts:

~~~ts
export {};
~~~

Create src/database/database.provider.ts:

~~~ts
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { AppEnv } from '../config/app-env';
import * as schema from './schema';
import { DATABASE, PG_POOL } from './database.tokens';

export type Database = NodePgDatabase<typeof schema>;

export const databaseProviders = [
  {
    provide: PG_POOL,
    inject: [ConfigService],
    useFactory: (config: ConfigService<AppEnv, true>): Pool =>
      new Pool({ connectionString: config.getOrThrow('DATABASE_URL', { infer: true }) })
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema })
  }
];
~~~

Create src/database/database.module.ts:

~~~ts
import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';

import { databaseProviders } from './database.provider';
import { DATABASE, PG_POOL } from './database.tokens';

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [...databaseProviders, DatabaseLifecycle],
  exports: [DATABASE]
})
export class DatabaseModule {}
~~~

Create drizzle.config.ts:

~~~ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run Drizzle Kit');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL }
});
~~~

- [ ] **Step 4: Verify configuration and typing**

Run:

~~~bash
pnpm test src/config/app-env.spec.ts
pnpm typecheck
~~~

Expected: both commands pass. The pool connects lazily, so neither command needs a running database.

- [ ] **Step 5: Commit**

~~~bash
git add src/config src/database drizzle.config.ts package.json pnpm-lock.yaml
git commit -m "feat: add Drizzle database boundary"
~~~

### Task 4: Boot NestJS and expose health

**Files:**

- Create: src/app.setup.ts
- Create: src/app.module.ts
- Create: src/main.ts
- Create: src/health/health.controller.ts
- Create: src/health/health.module.ts
- Create: test/setup-env.ts
- Create: test/health.e2e-spec.ts

- [ ] **Step 1: Write a failing health endpoint test**

Create test/setup-env.ts:

~~~ts
process.env.NODE_ENV = 'test';
process.env.PORT = '8081';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/mogak_test';
~~~

Create test/health.e2e-spec.ts:

~~~ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('GET /health', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns liveness without the application envelope', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });
});
~~~

- [ ] **Step 2: Verify the test fails**

Run:

~~~bash
pnpm test:e2e
~~~

Expected: FAIL because the root module and health controller do not exist.

- [ ] **Step 3: Implement bootstrap, global validation, and health**

Create src/app.setup.ts:

~~~ts
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

import { AppErrorCode } from './common/http/app-error-code';
import { AppException } from './common/http/app.exception';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: () => new AppException(AppErrorCode.INVALID_PARAMETER)
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
~~~

Create src/health/health.controller.ts:

~~~ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
~~~

Create src/health/health.module.ts:

~~~ts
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
~~~

Create src/app.module.ts:

~~~ts
import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, HealthModule]
})
export class AppModule {}
~~~

Create src/main.ts:

~~~ts
import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { AppEnv } from './config/app-env';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get(ConfigService<AppEnv, true>);
  await app.listen(config.getOrThrow('PORT', { infer: true }));
}

void bootstrap();
~~~

- [ ] **Step 4: Run all foundation checks**

Run:

~~~bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
~~~

Expected: every command exits with status 0.

- [ ] **Step 5: Check Cloud Run port handling**

Run:

~~~bash
PORT=8082 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mogak pnpm start
~~~

In a second terminal:

~~~bash
curl --fail http://127.0.0.1:8082/health
~~~

Expected:

~~~json
{"status":"ok"}
~~~

Stop the server after the request. A running PostgreSQL instance is unnecessary because no database query runs.

- [ ] **Step 6: Commit**

~~~bash
git add src test
git commit -m "feat: bootstrap NestJS service"
~~~

### Task 5: Handoff after verification

**Files:**

- Modify: docs/migration/2026-07-23-nestjs-migration-handoff.md
- Create: docs/superpowers/plans/2026-07-23-users-auth-implementation.md

- [ ] **Step 1: Update the migration status only after Task 4 is green**

Change the document status to 구현 진행 중 and add this exact implementation note:

~~~markdown
- NestJS bootstrap and Cloud Run PORT binding
- validated DATABASE_URL configuration
- Drizzle node-postgres provider boundary
- BaseResponse-compatible shared envelope and global error mapping
- unauthenticated GET /health
~~~

- [ ] **Step 2: Write the users/auth vertical plan**

The next plan must implement exactly:

~~~text
users, jobs, addresses, consent_items, user_consents,
social_accounts, auth_sessions, session-id JWT claims,
Apple/Google/Kakao provider ports, and contract tests.
~~~

It must preserve the 15-minute access token, 31-day refresh token, RefreshToken header, concurrent sessions, removal of POST /api/users/login, and hard-delete withdrawal.

- [ ] **Step 3: Commit the handoff**

~~~bash
git add docs/migration/2026-07-23-nestjs-migration-handoff.md docs/superpowers/plans/2026-07-23-users-auth-implementation.md
git commit -m "docs: plan users and auth migration"
~~~

## Plan self-review

- Foundation contains no product schema, so it cannot introduce rejected deletion, DailyJogak, locking, or index designs.
- Only GET /health is new; existing /api paths remain untouched.
- The database boundary uses standard PostgreSQL through pg and Drizzle, not provider-specific Supabase APIs.
- Environment validation fails at startup, while the health test works without a live database because Pool is lazy.

