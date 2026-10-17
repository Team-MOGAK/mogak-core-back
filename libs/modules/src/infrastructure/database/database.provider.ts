import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { LogEvent } from '@mogak/shared';

import * as schema from './schema';
import { DATABASE, PG_POOL } from './database.tokens';

export type Database = NodePgDatabase<typeof schema>;

const DATABASE_CONNECTION_TIMEOUT_MS = 5_000;
const DATABASE_QUERY_TIMEOUT_MS = 10_000;
const DATABASE_IDLE_TIMEOUT_MS = 30_000;

export const databaseProviders = [
  {
    provide: PG_POOL,
    inject: [ConfigService, PinoLogger],
    useFactory: (config: ConfigService, pinoLogger: PinoLogger): Pool => {
      const databaseUrl = config.get<string>('DATABASE_URL');
      if (databaseUrl !== undefined) return createPool(databaseUrl, pinoLogger);

      const jdbcUrl = config.getOrThrow<string>('APP_DB_URL');
      const url = new URL(jdbcUrl.startsWith('jdbc:') ? jdbcUrl.slice('jdbc:'.length) : jdbcUrl);
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new Error('APP_DB_URL은 PostgreSQL 연결 문자열이어야 합니다.');
      }

      const username = config.get<string>('APP_DB_USERNAME');
      const password = config.get<string>('APP_DB_PASSWORD');
      if (username !== undefined) url.username = username;
      if (password !== undefined) url.password = password;
      return createPool(url.toString(), pinoLogger);
    },
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];

function createPool(connectionString: string, pinoLogger: PinoLogger): Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
    query_timeout: DATABASE_QUERY_TIMEOUT_MS,
    statement_timeout: DATABASE_QUERY_TIMEOUT_MS,
  });
  const poolLogger = pinoLogger.logger.child({});
  pool.on('error', (error: Error) => {
    const details = error as Error & {
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
    };
    // Idle client errors must be observed so EventEmitter does not terminate the process.
    // Keep only allowlisted PostgreSQL identifiers in the application log.
    poolLogger.error(
      {
        event: LogEvent.DATABASE_POOL_ERROR,
        errorId: randomUUID(),
        alertEligible: true,
        err: {
          database: {
            code: safeDatabaseCode(details.code),
            constraint: safeDatabaseIdentifier(details.constraint),
            table: safeDatabaseIdentifier(details.table),
          },
        },
      },
      'Database pool error',
    );
  });
  return pool;
}

function safeDatabaseCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : undefined;
}

function safeDatabaseIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(value) ? value : undefined;
}
