import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';
import { DATABASE, PG_POOL } from './database.tokens';

export type Database = NodePgDatabase<typeof schema>;

const DATABASE_CONNECTION_TIMEOUT_MS = 5_000;
const DATABASE_QUERY_TIMEOUT_MS = 10_000;
const DATABASE_IDLE_TIMEOUT_MS = 30_000;

export const databaseProviders = [
  {
    provide: PG_POOL,
    inject: [ConfigService],
    useFactory: (config: ConfigService): Pool => {
      const databaseUrl = config.get<string>('DATABASE_URL');
      if (databaseUrl !== undefined) return createPool(databaseUrl);

      const jdbcUrl = config.getOrThrow<string>('APP_DB_URL');
      const url = new URL(jdbcUrl.startsWith('jdbc:') ? jdbcUrl.slice('jdbc:'.length) : jdbcUrl);
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new Error('APP_DB_URL은 PostgreSQL 연결 문자열이어야 합니다.');
      }

      const username = config.get<string>('APP_DB_USERNAME');
      const password = config.get<string>('APP_DB_PASSWORD');
      if (username !== undefined) url.username = username;
      if (password !== undefined) url.password = password;
      return createPool(url.toString());
    },
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];

function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
    query_timeout: DATABASE_QUERY_TIMEOUT_MS,
    statement_timeout: DATABASE_QUERY_TIMEOUT_MS,
  });
  pool.on('error', (error: Error) => {
    const details = error as Error & {
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
    };
    // A Pool error is emitted by an idle client. The listener keeps EventEmitter from
    // terminating the process while retaining only safe PostgreSQL identifiers.
    console.error({
      event: 'database_pool_error',
      code: safeDatabaseCode(details.code),
      constraint: safeDatabaseIdentifier(details.constraint),
      table: safeDatabaseIdentifier(details.table),
    });
  });
  return pool;
}

function safeDatabaseCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : undefined;
}

function safeDatabaseIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(value) ? value : undefined;
}
