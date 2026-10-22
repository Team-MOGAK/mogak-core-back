import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { InternalServerErrorException } from '@nestjs/common';

import * as schema from './schema';
import { DATABASE, PG_POOL } from './database.tokens';
import { DatabaseExceptionHandler } from './databaseExceptionHandler';

export type Database = NodePgDatabase<typeof schema>;

const DATABASE_CONNECTION_TIMEOUT_MS = 5_000;
const DATABASE_QUERY_TIMEOUT_MS = 10_000;
const DATABASE_IDLE_TIMEOUT_MS = 30_000;

export const databaseProviders = [
  {
    provide: PG_POOL,
    inject: [ConfigService, DatabaseExceptionHandler],
    useFactory: (config: ConfigService, exceptionHandler: DatabaseExceptionHandler): Pool => {
      const pool = createPool(resolveConnectionString(config));
      // Observe idle client errors before exposing the pool to consumers.
      pool.on('error', (error: Error) => exceptionHandler.handle(error));
      return pool;
    },
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];

function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
    query_timeout: DATABASE_QUERY_TIMEOUT_MS,
    statement_timeout: DATABASE_QUERY_TIMEOUT_MS,
  });
}

function resolveConnectionString(config: ConfigService): string {
  const databaseUrl = config.get<string>('DATABASE_URL');
  if (databaseUrl !== undefined) return databaseUrl;

  const jdbcUrl = config.getOrThrow<string>('APP_DB_URL');
  const url = new URL(jdbcUrl.startsWith('jdbc:') ? jdbcUrl.slice('jdbc:'.length) : jdbcUrl);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new InternalServerErrorException('APP_DB_URL은 PostgreSQL 연결 문자열이어야 합니다.');
  }

  const username = config.get<string>('APP_DB_USERNAME');
  const password = config.get<string>('APP_DB_PASSWORD');
  if (username !== undefined) url.username = username;
  if (password !== undefined) url.password = password;
  return url.toString();
}
