/* global URL, console, process */

import 'dotenv/config';
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

const pool = new pg.Pool({ connectionString: connectionStringFromEnvironment() });
try {
  const result = await pool.query(
    'DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP',
  );
  console.log(`Expired auth sessions deleted: ${result.rowCount ?? 0}.`);
} finally {
  await pool.end();
}
