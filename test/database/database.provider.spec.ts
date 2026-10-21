import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { Pool } from 'pg';

import { databaseProviders } from '@infra/database/database.provider';
import { DatabasePoolExceptionHandler } from '@infra/database/databasePoolExceptionHandler';
import { PG_POOL } from '@infra/database/database.tokens';

const poolProvider = databaseProviders.find((provider) => provider.provide === PG_POOL);
if (poolProvider === undefined) throw new Error('database pool provider was not registered');

const createPool = poolProvider.useFactory as (
  config: ConfigService,
  exceptionHandler: DatabasePoolExceptionHandler,
) => Pool;

function configFor(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`${key} is required`);
      return value;
    }),
  } as unknown as ConfigService;
}

describe('DB 연결 풀 provider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      name: 'DATABASE_URL',
      values: { DATABASE_URL: 'postgresql://db.example/mogak' },
      connectionString: 'postgresql://db.example/mogak',
    },
    {
      name: 'APP_DB_URL',
      values: {
        APP_DB_URL: 'jdbc:postgresql://db.example/mogak',
        APP_DB_USERNAME: 'mogak',
        APP_DB_PASSWORD: 'test-password',
      },
      connectionString: 'postgresql://mogak:test-password@db.example/mogak',
    },
  ])(
    '$name 설정으로 풀을 생성하고 반환 전에 오류 처리기를 연결한다',
    async ({ values, connectionString }) => {
      const logError = jest.fn();
      const child = jest.fn(() => ({ error: logError }));
      const logger = { logger: { child } } as unknown as PinoLogger;
      const notify = jest.fn();
      const exceptionHandler = new DatabasePoolExceptionHandler(logger, { notify });
      const pool = createPool(configFor(values), exceptionHandler);

      try {
        expect(pool.options).toMatchObject({
          connectionString,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
          query_timeout: 10_000,
          statement_timeout: 10_000,
        });
        expect(pool.listenerCount('error')).toBeGreaterThan(0);
        expect(child).toHaveBeenCalledWith({});

        const poolError = Object.assign(new Error('private query and params'), {
          code: '23505',
          constraint: 'users;drop',
          table: 'users',
        });
        expect(() => pool.emit('error', poolError)).not.toThrow();
        expect(logError).toHaveBeenCalledWith(
          {
            event: 'database_pool_error',
            errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
            alertEligible: true,
            err: {
              database: {
                code: '23505',
                constraint: undefined,
                table: 'users',
              },
            },
          },
          'Database pool error',
        );
        expect(JSON.stringify(logError.mock.calls)).not.toContain('private query and params');
        expect(notify).toHaveBeenCalledWith({
          event: 'database_pool_error',
          errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          statusCode: 500,
        });
      } finally {
        await pool.end();
      }
    },
  );
});
