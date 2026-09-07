/* global URL, console, process */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

function connectionStringFromEnvironment() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const jdbcUrl = process.env.APP_DB_URL;
  if (!jdbcUrl) throw new Error('DATABASE_URL or APP_DB_URL is required');
  const url = new URL(jdbcUrl.startsWith('jdbc:') ? jdbcUrl.slice('jdbc:'.length) : jdbcUrl);
  if (process.env.APP_DB_USERNAME) url.username = process.env.APP_DB_USERNAME;
  if (process.env.APP_DB_PASSWORD) url.password = process.env.APP_DB_PASSWORD;
  return url.toString();
}

const migrationSql = await readFile(
  new URL('./migrations/2026-08-17-v2-application-delete-post-retention.sql', import.meta.url),
  'utf8',
);

if (process.argv.slice(2).some((argument) => argument !== '--')) {
  throw new Error('지원하지 않는 옵션입니다. 사용법: pnpm db:migrate:legacy-compat');
}
const pool = new pg.Pool({ connectionString: connectionStringFromEnvironment() });
try {
  const client = await pool.connect();
  try {
    client.on('notice', (notice) => {
      if (notice.message.startsWith('Legacy schedule conflict ')) {
        console.error(notice.message);
      }
    });
    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');
    console.log('Legacy schema compatibility migration completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
