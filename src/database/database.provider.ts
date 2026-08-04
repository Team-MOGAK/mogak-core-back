import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';
import { DATABASE, PG_POOL } from './database.tokens';

export type Database = NodePgDatabase<typeof schema>;

export const databaseProviders = [
  {
    provide: PG_POOL,
    inject: [ConfigService],
    useFactory: (config: ConfigService): Pool => {
      const databaseUrl = config.get<string>('DATABASE_URL');
      if (databaseUrl !== undefined) return new Pool({ connectionString: databaseUrl });

      const jdbcUrl = config.getOrThrow<string>('APP_DB_URL');
      const url = new URL(jdbcUrl.startsWith('jdbc:') ? jdbcUrl.slice('jdbc:'.length) : jdbcUrl);
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new Error('APP_DB_URL은 PostgreSQL 연결 문자열이어야 합니다.');
      }

      const username = config.get<string>('APP_DB_USERNAME');
      const password = config.get<string>('APP_DB_PASSWORD');
      if (username !== undefined) url.username = username;
      if (password !== undefined) url.password = password;
      return new Pool({ connectionString: url.toString() });
    },
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
