import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { authSessions, addresses, jobs, users } from '@infra/database/schema';
import { CurrentSessionNotActiveException } from '@core/users/domain/exception/userPersistence.exception';
import { UserRepository } from '@infra/users/repository/user.repository';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

afterAll(async () => {
  await pool.end();
});

describe('사용자 가입 PostgreSQL 동시성 통합', () => {
  it('같은 PENDING 사용자의 동시 가입 완료는 한 번만 확정하고 각 세션을 교체한다', async () => {
    const [job] = await db
      .insert(jobs)
      .values({ name: `동시성 직업 ${randomUUID()}` })
      .returning({ id: jobs.id });
    const [address] = await db
      .insert(addresses)
      .values({ name: `동시성 지역 ${randomUUID()}` })
      .returning({ id: addresses.id });
    if (job === undefined || address === undefined) {
      throw new Error('registration metadata fixture did not return rows');
    }

    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'PENDING' })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('pending user fixture did not return a row');

    const currentSessionA = randomUUID();
    const currentSessionB = randomUUID();
    const replacementSessionA = randomUUID();
    const replacementSessionB = randomUUID();
    await db.insert(authSessions).values([
      {
        id: currentSessionA,
        userId: user.id,
        refreshTokenHash: tokenHash(),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
      {
        id: currentSessionB,
        userId: user.id,
        refreshTokenHash: tokenHash(),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    ]);

    const repository = new UserRepository(db as never);
    const results = await Promise.all([
      repository.completeRegistration({
        userId: user.id,
        nickname: '선착순 A',
        jobId: job.id,
        addressId: address.id,
        consents: [],
        currentSessionId: currentSessionA,
        replacementSession: {
          id: replacementSessionA,
          refreshTokenHash: tokenHash(),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
        now: new Date('2026-08-29T00:00:00.000Z'),
      }),
      repository.completeRegistration({
        userId: user.id,
        nickname: '선착순 B',
        jobId: job.id,
        addressId: address.id,
        consents: [],
        currentSessionId: currentSessionB,
        replacementSession: {
          id: replacementSessionB,
          refreshTokenHash: tokenHash(),
          expiresAt: new Date('2030-08-29T00:00:00.000Z'),
        },
        now: new Date('2026-08-29T00:00:01.000Z'),
      }),
    ]);

    const [storedUser] = await db
      .select({
        role: users.role,
        nickname: users.nickname,
        jobId: users.jobId,
        addressId: users.addressId,
      })
      .from(users)
      .where(eq(users.id, user.id));
    const storedSessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id));

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe(user.id);
    expect(results[1]?.id).toBe(user.id);
    expect(results[0]?.nickname).toBe(results[1]?.nickname);
    expect(storedUser).toMatchObject({ role: 'USER', jobId: job.id, addressId: address.id });
    expect(['선착순 A', '선착순 B']).toContain(storedUser?.nickname);
    expect(storedSessions.map((session) => session.id).sort()).toEqual(
      [replacementSessionA, replacementSessionB].sort(),
    );
  });

  it('같은 current session의 동시 가입 완료는 한 요청을 비활성 세션으로 종료한다', async () => {
    const [job] = await db
      .insert(jobs)
      .values({ name: `동일 세션 직업 ${randomUUID()}` })
      .returning({ id: jobs.id });
    const [address] = await db
      .insert(addresses)
      .values({ name: `동일 세션 지역 ${randomUUID()}` })
      .returning({ id: addresses.id });
    if (job === undefined || address === undefined) {
      throw new Error('registration metadata fixture did not return rows');
    }

    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'PENDING' })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('pending user fixture did not return a row');

    const currentSessionId = randomUUID();
    const replacementSessionA = randomUUID();
    const replacementSessionB = randomUUID();
    await db.insert(authSessions).values({
      id: currentSessionId,
      userId: user.id,
      refreshTokenHash: tokenHash(),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const repository = new UserRepository(db as never);
    const results = await Promise.allSettled([
      repository.completeRegistration({
        userId: user.id,
        nickname: '동일 세션 A',
        jobId: job.id,
        addressId: address.id,
        consents: [],
        currentSessionId,
        replacementSession: {
          id: replacementSessionA,
          refreshTokenHash: tokenHash(),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
        now: new Date('2026-08-29T00:00:00.000Z'),
      }),
      repository.completeRegistration({
        userId: user.id,
        nickname: '동일 세션 B',
        jobId: job.id,
        addressId: address.id,
        consents: [],
        currentSessionId,
        replacementSession: {
          id: replacementSessionB,
          refreshTokenHash: tokenHash(),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
        now: new Date('2026-08-29T00:00:01.000Z'),
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    const [storedUser] = await db
      .select({ role: users.role, nickname: users.nickname })
      .from(users)
      .where(eq(users.id, user.id));
    const storedSessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === 'rejected' && rejected[0].reason).toBeInstanceOf(
      CurrentSessionNotActiveException,
    );
    expect(storedUser).toMatchObject({ role: 'USER' });
    expect(['동일 세션 A', '동일 세션 B']).toContain(storedUser?.nickname);
    expect(storedSessions).toHaveLength(1);
    expect([replacementSessionA, replacementSessionB]).toContain(storedSessions[0]?.id);
  });
});

function tokenHash(): string {
  return randomUUID().replaceAll('-', '');
}
