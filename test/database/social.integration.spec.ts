import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import { SocialRepository } from '@infra/social/repository/social.repository';
import { follows, users } from '@infra/database/schema';
import { pinoLoggerStub } from '../fixtures/pinoLogger.fixture';

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
    const results = await Promise.all([insert(), insert()]);
    expect(results.filter((result) => result.length === 1)).toHaveLength(1);
    await db.insert(follows).values({ followerId: second, followingId: first });
    await expect(
      db.select().from(follows).where(eq(follows.followerId, first)),
    ).resolves.toHaveLength(1);
    await expect(
      db.select().from(follows).where(eq(follows.followingId, first)),
    ).resolves.toHaveLength(1);
  });

  it.each(['write-first', 'withdrawal-first'] as const)(
    '팔로우 생성과 회원 탈퇴가 %s로 시작해도 교착 없이 허용된 결과로 끝난다',
    async (order) => {
      const [first, second] = await createUsers();
      const social = new SocialRepository(db as never, pinoLoggerStub());
      const follow = () => social.createFollow({ followerId: second, followingId: first });
      const withdraw = () => new AuthRepository(db as never).deleteUser(first);
      const outcomes =
        order === 'write-first'
          ? await Promise.allSettled([follow(), withdraw()])
          : await Promise.allSettled([withdraw(), follow()]);
      const followOutcome = order === 'write-first' ? outcomes[0] : outcomes[1];
      const withdrawalOutcome = order === 'write-first' ? outcomes[1] : outcomes[0];

      expect(withdrawalOutcome).toMatchObject({ status: 'fulfilled', value: true });
      if (followOutcome?.status === 'rejected') {
        expect(followOutcome.reason).toBeInstanceOf(DomainException);
        expect(followOutcome.reason.code).toBe(DomainErrorCode.USER_NOT_FOUND);
      }
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
          expect(hasErrorCode(outcome.reason, '23503')).toBe(false);
        }
      }
      await expect(db.select().from(users).where(eq(users.id, first))).resolves.toHaveLength(0);
      await expect(db.select().from(users).where(eq(users.id, second))).resolves.toHaveLength(1);
      await expect(db.select().from(follows)).resolves.toHaveLength(0);
    },
  );
});

function hasErrorCode(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    if ('code' in current && current.code === code) return true;
    seen.add(current);
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

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
