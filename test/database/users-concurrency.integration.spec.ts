import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import {
  authSessions,
  addresses,
  consentItems,
  jobs,
  userConsents,
  users,
} from '@infra/database/schema';
import { CurrentSessionNotActiveException } from '@core/users/domain/exception/userPersistence.exception';
import { ConsentRepository } from '@infra/users/repository/consent.repository';
import { UserRepository } from '@infra/users/repository/user.repository';
import { pinoLoggerStub } from '../fixtures/pinoLogger.fixture';

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

  it.each(['write-first', 'withdrawal-first'] as const)(
    '프로필 수정과 회원 탈퇴가 %s로 시작해도 계정이 부활하지 않는다',
    async (order) => {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
        .returning({ id: users.id });
      if (user === undefined) throw new Error('user fixture insert did not return a row');

      const repository = new UserRepository(db as never);
      const update = () =>
        repository.updateNickname({
          userId: user.id,
          nickname: `동시 수정 ${randomUUID()}`,
          now: new Date('2026-08-29T00:00:00.000Z'),
        });
      const withdraw = () => new AuthRepository(db as never).deleteUser(user.id);
      const outcomes =
        order === 'write-first'
          ? await Promise.allSettled([update(), withdraw()])
          : await Promise.allSettled([withdraw(), update()]);
      const updateOutcome = order === 'write-first' ? outcomes[0] : outcomes[1];
      const withdrawalOutcome = order === 'write-first' ? outcomes[1] : outcomes[0];

      expect(withdrawalOutcome).toMatchObject({ status: 'fulfilled', value: true });
      expect(updateOutcome).toMatchObject({ status: 'fulfilled' });
      if (updateOutcome?.status === 'fulfilled') expect(typeof updateOutcome.value).toBe('boolean');
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
          expect(hasErrorCode(outcome.reason, '23503')).toBe(false);
        }
      }
      await expect(db.select().from(users).where(eq(users.id, user.id))).resolves.toHaveLength(0);
    },
  );

  it.each(['write-first', 'withdrawal-first'] as const)(
    '동의 갱신과 회원 탈퇴가 %s로 시작해도 동의가 남지 않는다',
    async (order) => {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
        .returning({ id: users.id });
      const [item] = await db
        .insert(consentItems)
        .values({
          code: `CONCURRENT_${randomUUID()}`,
          name: '동시성 테스트 동의',
          required: false,
          active: true,
        })
        .returning({ id: consentItems.id });
      if (user === undefined || item === undefined) {
        throw new Error('consent fixture insert did not return rows');
      }

      const repository = new ConsentRepository(db as never, pinoLoggerStub());
      const update = () =>
        repository.upsertUserConsents(
          user.id,
          [{ consentItemId: item.id, agreed: true }],
          new Date('2026-08-29T00:00:00.000Z'),
        );
      const withdraw = () => new AuthRepository(db as never).deleteUser(user.id);
      const outcomes =
        order === 'write-first'
          ? await Promise.allSettled([update(), withdraw()])
          : await Promise.allSettled([withdraw(), update()]);
      const updateOutcome = order === 'write-first' ? outcomes[0] : outcomes[1];
      const withdrawalOutcome = order === 'write-first' ? outcomes[1] : outcomes[0];

      expect(withdrawalOutcome).toMatchObject({ status: 'fulfilled', value: true });
      if (updateOutcome?.status === 'fulfilled') {
        expect(updateOutcome.value).toBeUndefined();
      } else if (updateOutcome?.status === 'rejected') {
        expect(updateOutcome.reason).toBeInstanceOf(DomainException);
        expect(updateOutcome.reason.code).toBe(DomainErrorCode.USER_NOT_FOUND);
      }
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
          expect(hasErrorCode(outcome.reason, '23503')).toBe(false);
        }
      }
      await expect(db.select().from(users).where(eq(users.id, user.id))).resolves.toHaveLength(0);
      await expect(
        db.select().from(userConsents).where(eq(userConsents.userId, user.id)),
      ).resolves.toHaveLength(0);
    },
  );
});

function tokenHash(): string {
  return randomUUID().replaceAll('-', '');
}

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
