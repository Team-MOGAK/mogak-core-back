import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';

import { AuthRepository } from '@infra/auth/repository/auth.repository';
import { users } from '@infra/database/schema';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });

afterAll(async () => {
  await pool.end();
});

describe('사용자 advisory lock PostgreSQL 통합', () => {
  it('탈퇴는 다른 connection의 사용자 lock이 해제된 뒤에만 실제 삭제를 수행한다', async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    const [user] = await drizzle(pool)
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('withdrawal fixture user was not created');
    try {
      await beginAndLock(first, user.id);
      const [secondBackend] = (
        await second.query<{ pid: number }>('select pg_backend_pid() as pid')
      ).rows;
      const secondPid = secondBackend?.pid;
      if (secondPid === undefined) throw new Error('second backend pid was not returned');

      const deletion = new AuthRepository(drizzle(second) as never).deleteUser(user.id);
      await waitForAdvisoryWait(secondPid);
      await expect(
        drizzle(pool).select().from(users).where(eq(users.id, user.id)),
      ).resolves.toHaveLength(1);

      await first.query('commit');
      await expect(deletion).resolves.toBe(true);
      await expect(
        drizzle(pool).select().from(users).where(eq(users.id, user.id)),
      ).resolves.toHaveLength(0);
    } finally {
      await safelyRollback(first);
      await safelyRollback(second);
      first.release();
      second.release();
    }
  });
});

async function beginAndLock(client: PoolClient, lockKey: number): Promise<void> {
  await client.query('begin');
  await client.query('select pg_advisory_xact_lock($1)', [lockKey]);
}

async function safelyRollback(client: PoolClient): Promise<void> {
  try {
    await client.query('rollback');
  } catch {
    // The transaction may already have been committed/rolled back by the test.
  }
}

async function waitForAdvisoryWait(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [lockState] = (
      await pool.query<{ waiting: boolean }>(
        "select exists (select 1 from pg_locks where pid = $1 and locktype = 'advisory' and not granted) as waiting",
        [pid],
      )
    ).rows;
    const waiting = lockState?.waiting ?? false;
    if (waiting) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('second connection did not enter advisory-lock wait state');
}
