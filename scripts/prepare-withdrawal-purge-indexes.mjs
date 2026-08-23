import { Pool } from 'pg';
import process from 'node:process';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required to prepare withdrawal purge indexes');
}

const statements = [
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_auth_sessions_user_id" ON "auth_sessions" USING btree ("user_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_follow_to_id" ON "follow" USING btree ("to_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_jogak_mogak_id" ON "jogak" USING btree ("mogak_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_jogak_schedules_jogak_id" ON "jogak_schedules" USING btree ("jogak_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_modarat_user_id" ON "modarat" USING btree ("user_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_mogak_modarat_id" ON "mogak" USING btree ("modarat_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_post_comment_post_id" ON "post_comment" USING btree ("post_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_post_comment_user_id" ON "post_comment" USING btree ("user_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_post_img_post_id" ON "post_img" USING btree ("post_id")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_post_user_id" ON "post" USING btree ("user_id")',
];

const pool = new Pool({ connectionString: databaseUrl });
try {
  for (const statement of statements) {
    await pool.query(statement);
  }
} finally {
  await pool.end();
}
