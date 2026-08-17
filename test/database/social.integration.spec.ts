import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { follows, users } from '@infra/database/schema';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error('DATABASE_URL is required for database integration tests');
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);
afterAll(async () => {
  await pool.end();
});

describe('소셜 PostgreSQL 통합', () => {
  it('같은 방향의 팔로우는 하나만 유지하고 반대 방향 팔로우는 독립적으로 보존한다', async () => {
    const [first, second] = await createUsers();
    const insert = () =>
      db
        .insert(follows)
        .values({ followerId: first, followingId: second })
        .onConflictDoNothing({ target: [follows.followerId, follows.followingId] })
        .returning({ id: follows.id });
    try {
      const results = await Promise.all([insert(), insert()]);
      expect(results.filter((result) => result.length === 1)).toHaveLength(1);
      await db.insert(follows).values({ followerId: second, followingId: first });
      await expect(
        db.select().from(follows).where(eq(follows.followerId, first)),
      ).resolves.toHaveLength(1);
      await expect(
        db.select().from(follows).where(eq(follows.followingId, first)),
      ).resolves.toHaveLength(1);
    } finally {
      await db.delete(users).where(eq(users.id, first));
      await db.delete(users).where(eq(users.id, second));
    }
  });
});

async function createUsers(): Promise<[number, number]> {
  const created = await db
    .insert(users)
    .values([
      { email: `${randomUUID()}@mogak.test`, role: 'USER' },
      { email: `${randomUUID()}@mogak.test`, role: 'USER' },
    ])
    .returning({ id: users.id });
  const [first, second] = created;
  if (first === undefined || second === undefined) {
    throw new Error('user fixtures did not return two rows');
  }
  return [first.id, second.id];
}
