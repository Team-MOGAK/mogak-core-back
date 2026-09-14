import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';

import { databaseProviders } from '@infra/database/database.provider';
import { PG_POOL } from '@infra/database/database.tokens';

const poolProvider = databaseProviders.find((provider) => provider.provide === PG_POOL);
if (poolProvider === undefined) throw new Error('database pool provider was not registered');

const createPool = poolProvider.useFactory as (config: ConfigService) => Pool;

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
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const pool = createPool(configFor({ DATABASE_URL: 'postgresql://db.example/mogak' }));

    try {
      expect(pool.options).toMatchObject({
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        query_timeout: 10_000,
        statement_timeout: 10_000,
      });
      expect(pool.listenerCount('error')).toBeGreaterThan(0);

      const error = Object.assign(new Error('private query and params'), {
        code: '23505',
        constraint: 'users;drop',
        table: 'users',
      });
      expect(() => pool.emit('error', error)).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith({
        event: 'database_pool_error',
        code: '23505',
        constraint: undefined,
        table: 'users',
      });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private query and params');
    } finally {
      await pool.end();
    }
  });
});
