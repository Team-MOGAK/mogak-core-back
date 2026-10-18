import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { Pool } from 'pg';

import { databaseProviders } from '@infra/database/database.provider';
import { PG_POOL } from '@infra/database/database.tokens';

const poolProvider = databaseProviders.find((provider) => provider.provide === PG_POOL);
if (poolProvider === undefined) throw new Error('database pool provider was not registered');

const createPool = poolProvider.useFactory as (
  config: ConfigService,
  logger: PinoLogger,
  alertNotifier?: {
    notify: (alert: { event: string; errorId: string; statusCode?: number }) => void;
  },
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

describe('database pool provider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('DATABASE_URL 경로에 timeout과 idle error listener를 적용한다', async () => {
    const logError = jest.fn();
    const child = jest.fn(() => ({ error: logError }));
    const logger = { logger: { child } } as unknown as PinoLogger;
    const notify = jest.fn();
    const pool = createPool(configFor({ DATABASE_URL: 'postgresql://db.example/mogak' }), logger, {
      notify,
    });

    try {
      expect(pool.options).toMatchObject({
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
  });
});
