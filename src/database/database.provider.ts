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
      new Pool({ connectionString: config.getOrThrow('DATABASE_URL', { infer: true }) }),
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
