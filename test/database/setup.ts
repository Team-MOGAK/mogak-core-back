import { beforeAll } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(
    'DATABASE_URL for database integration tests must target a database ending in _test',
  );
}

beforeAll(async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  } finally {
    await pool.end();
  }
});
