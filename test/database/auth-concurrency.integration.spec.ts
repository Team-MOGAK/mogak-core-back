import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { AuthTokenVerifierPort } from '@core/auth/application/port/authTokenVerifier.port';
import type { SessionTokenIssuerPort } from '@core/auth/application/port/sessionTokenIssuer.port';
import type { SocialIdentityVerifierPort } from '@core/auth/application/port/socialIdentityVerifier.port';
import { AuthService } from '@core/auth/application/service/auth.service';
import { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import { UserPersistenceException } from '@core/users/domain/exception/userPersistence.exception';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import {
  authSessions,
  follows,
  postComments,
  postLikes,
  posts,
  socialAccounts,
  users,
} from '@infra/database/schema';
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

describe('인증·세션 PostgreSQL 동시성 통합', () => {
  it('11개 이상 활성 세션과 다른 사용자의 행은 보존하고 해당 사용자의 만료 행만 정리한다', async () => {
    const [user, other] = await db
      .insert(users)
      .values([
        { email: `${randomUUID()}@mogak.test`, role: 'PENDING' },
        { email: `${randomUUID()}@mogak.test`, role: 'PENDING' },
      ])
      .returning({ id: users.id });
    if (user === undefined || other === undefined) throw new Error('missing fixture users');
    const activeIds = Array.from({ length: 11 }, () => randomUUID());
    const expiredId = randomUUID();
    const otherId = randomUUID();
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.insert(authSessions).values([
      ...activeIds.map((id) => ({
        id,
        userId: user.id,
        refreshTokenHash: tokenHash(),
        expiresAt,
      })),
      { id: expiredId, userId: user.id, refreshTokenHash: tokenHash(), expiresAt: new Date(0) },
      { id: otherId, userId: other.id, refreshTokenHash: tokenHash(), expiresAt: new Date(0) },
    ]);
    const newId = randomUUID();
    await new AuthRepository(db as never).createSession(user.id, {
      id: newId,
      refreshTokenHash: tokenHash(),
      expiresAt,
    });
    const rows = await db.select({ id: authSessions.id }).from(authSessions);
    expect(rows.map(({ id }) => id).sort()).toEqual([...activeIds, otherId, newId].sort());
  });

  it('세션 삽입이 실패하면 앞선 만료 행 정리도 rollback한다', async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `${randomUUID()}@mogak.test`,
        role: 'PENDING',
      })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('missing fixture user');
    const id = randomUUID();
    await db.insert(authSessions).values({
      id,
      userId: user.id,
      refreshTokenHash: tokenHash(),
      expiresAt: new Date(0),
    });
    await expect(
      new AuthRepository(db as never).createSession(user.id, {
        id: 'not-a-uuid',
        refreshTokenHash: tokenHash(),
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ).rejects.toThrow();
    expect(await db.select({ id: authSessions.id }).from(authSessions)).toEqual([{ id }]);
  });

  it('같은 social identity의 동시 로그인은 한 사용자와 두 세션으로 수렴한다', async () => {
    const identity = {
      provider: SocialProvider.GOOGLE,
      providerUserId: `google-${randomUUID()}`,
      email: `${randomUUID()}@mogak.test`,
      emailVerified: true,
    } as const;
    const authRepository = new AuthRepository(db as never);
    const tokenIssuer = tokenIssuerStub();
    const service = new AuthService(
      socialIdentityVerifier(identity),
      authRepository,
      tokenIssuer,
      unusedTokenVerifier(),
    );

    const outcomes = await Promise.all([
      service.login(identity.provider, `token-${randomUUID()}`),
      service.login(identity.provider, `token-${randomUUID()}`),
    ]);

    const storedUsers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, identity.email));
    const storedSocialAccounts = await db
      .select({ userId: socialAccounts.userId })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.provider, identity.provider),
          eq(socialAccounts.providerUserId, identity.providerUserId),
        ),
      );
    const userId = storedUsers[0]?.id;
    if (userId === undefined) throw new Error('concurrent login did not create a user');
    const storedSessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, userId));

    expect(storedUsers).toEqual([{ id: userId, role: 'PENDING' }]);
    expect(storedSocialAccounts).toEqual([{ userId }]);
    expect(storedSessions).toHaveLength(2);
    expect(outcomes.map((outcome) => outcome.result.userId)).toEqual([userId, userId]);
    expect(outcomes.map((outcome) => outcome.flow).sort()).toEqual(['NEW', 'RESUME']);
    expect(outcomes.every((outcome) => outcome.result.isRegistered === false)).toBe(true);
  });

  it('logout이 current session을 먼저 삭제하면 replacement session을 남기지 않는다', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'PENDING' })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('user fixture insert did not return a row');

    const currentSessionId = randomUUID();
    const replacementSessionId = randomUUID();
    await db.insert(authSessions).values({
      id: currentSessionId,
      userId: user.id,
      refreshTokenHash: tokenHash(),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const locker = await pool.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM auth_sessions WHERE id = $1 FOR UPDATE', [
        currentSessionId,
      ]);

      const replacing = new UserRepository(db as never).replaceSession({
        userId: user.id,
        currentSessionId,
        replacementSession: {
          id: replacementSessionId,
          refreshTokenHash: tokenHash(),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      });

      await locker.query('DELETE FROM auth_sessions WHERE id = $1', [currentSessionId]);
      await locker.query('COMMIT');

      await expect(replacing).rejects.toBeInstanceOf(UserPersistenceException);
      await expect(
        db
          .select({ id: authSessions.id })
          .from(authSessions)
          .where(eq(authSessions.userId, user.id)),
      ).resolves.toHaveLength(0);
    } finally {
      await locker.query('ROLLBACK').catch(() => undefined);
      locker.release();
    }
  });

  it.each(['write-first', 'withdrawal-first'] as const)(
    '세션 회전과 회원 탈퇴가 %s로 시작해도 세션이 부활하지 않는다',
    async (order) => {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
        .returning({ id: users.id });
      if (user === undefined) throw new Error('user fixture insert did not return a row');

      const sessionId = randomUUID();
      const currentHash = tokenHash();
      await db.insert(authSessions).values({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: currentHash,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      });

      const repository = new AuthRepository(db as never);
      const rotate = () =>
        repository.rotateSession({
          userId: user.id,
          sessionId,
          currentRefreshTokenHash: currentHash,
          nextRefreshTokenHash: tokenHash(),
          nextExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
          now: new Date('2026-08-29T00:00:00.000Z'),
        });
      const withdraw = () => repository.deleteUser(user.id);
      const outcomes =
        order === 'write-first'
          ? await Promise.allSettled([rotate(), withdraw()])
          : await Promise.allSettled([withdraw(), rotate()]);
      const rotateOutcome = order === 'write-first' ? outcomes[0] : outcomes[1];
      const withdrawalOutcome = order === 'write-first' ? outcomes[1] : outcomes[0];

      expect(withdrawalOutcome).toMatchObject({ status: 'fulfilled', value: true });
      expect(rotateOutcome).toMatchObject({ status: 'fulfilled' });
      if (rotateOutcome?.status === 'fulfilled') expect(typeof rotateOutcome.value).toBe('boolean');
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
          expect(hasErrorCode(outcome.reason, '23503')).toBe(false);
        }
      }
      await expect(db.select().from(users).where(eq(users.id, user.id))).resolves.toHaveLength(0);
      await expect(
        db.select().from(authSessions).where(eq(authSessions.userId, user.id)),
      ).resolves.toHaveLength(0);
    },
  );

  it.each(['write-first', 'withdrawal-first'] as const)(
    '세션 생성과 회원 탈퇴가 %s로 시작해도 삭제된 계정에 세션을 만들지 않는다',
    async (order) => {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
        .returning({ id: users.id });
      if (user === undefined) throw new Error('user fixture insert did not return a row');

      const repository = new AuthRepository(db as never);
      const create = () =>
        repository.createSession(user.id, {
          id: randomUUID(),
          refreshTokenHash: tokenHash(),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        });
      const withdraw = () => repository.deleteUser(user.id);
      const outcomes =
        order === 'write-first'
          ? await Promise.allSettled([create(), withdraw()])
          : await Promise.allSettled([withdraw(), create()]);
      const createOutcome = order === 'write-first' ? outcomes[0] : outcomes[1];
      const withdrawalOutcome = order === 'write-first' ? outcomes[1] : outcomes[0];

      expect(withdrawalOutcome).toMatchObject({ status: 'fulfilled', value: true });
      if (createOutcome?.status === 'fulfilled') {
        expect(createOutcome.value).toBeUndefined();
      } else if (createOutcome?.status === 'rejected') {
        expect(createOutcome.reason).toBeInstanceOf(DomainException);
        expect(createOutcome.reason.code).toBe(DomainErrorCode.USER_NOT_FOUND);
      }
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
          expect(hasErrorCode(outcome.reason, '23503')).toBe(false);
        }
      }
      await expect(db.select().from(users).where(eq(users.id, user.id))).resolves.toHaveLength(0);
      await expect(
        db.select().from(authSessions).where(eq(authSessions.userId, user.id)),
      ).resolves.toHaveLength(0);
    },
  );

  it.each(['a-first', 'b-first'] as const)(
    '상호 댓글·좋아요·팔로우가 있는 두 계정의 동시 탈퇴(%s)는 관계를 정리하고 제3자 데이터를 보존한다',
    async (order) => {
      const [first, second, third] = await db
        .insert(users)
        .values([
          { email: `${randomUUID()}@mogak.test`, role: 'USER' },
          { email: `${randomUUID()}@mogak.test`, role: 'USER' },
          { email: `${randomUUID()}@mogak.test`, role: 'USER' },
        ])
        .returning({ id: users.id });
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error('mutual withdrawal user fixture did not return three rows');
      }

      const [firstPost, secondPost, thirdPost] = await db
        .insert(posts)
        .values([
          { jogakExecutionId: uniqueExecutionId(), authorId: first.id, contents: 'A 글' },
          { jogakExecutionId: uniqueExecutionId(), authorId: second.id, contents: 'B 글' },
          { jogakExecutionId: uniqueExecutionId(), authorId: third.id, contents: 'C 글' },
        ])
        .returning({ id: posts.id, authorId: posts.authorId });
      if (firstPost === undefined || secondPost === undefined || thirdPost === undefined) {
        throw new Error('mutual withdrawal post fixture did not return three rows');
      }

      await db.insert(postComments).values([
        { postId: firstPost.id, authorId: second.id, contents: 'B가 A 글에 댓글' },
        { postId: secondPost.id, authorId: first.id, contents: 'A가 B 글에 댓글' },
        { postId: thirdPost.id, authorId: third.id, contents: 'C 댓글' },
      ]);
      await db.insert(postLikes).values([
        { postId: firstPost.id, userId: second.id },
        { postId: secondPost.id, userId: first.id },
        { postId: thirdPost.id, userId: third.id },
      ]);
      await db.insert(follows).values([
        { followerId: first.id, followingId: second.id },
        { followerId: second.id, followingId: first.id },
      ]);

      const repository = new AuthRepository(db as never);
      const withdrawFirst = () => repository.deleteUser(first.id);
      const withdrawSecond = () => repository.deleteUser(second.id);
      const outcomes =
        order === 'a-first'
          ? await Promise.allSettled([withdrawFirst(), withdrawSecond()])
          : await Promise.allSettled([withdrawSecond(), withdrawFirst()]);

      expect(outcomes).toEqual([
        { status: 'fulfilled', value: true },
        { status: 'fulfilled', value: true },
      ]);
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
          expect(hasErrorCode(outcome.reason, '23503')).toBe(false);
        }
      }

      await expect(db.select().from(users).where(eq(users.id, first.id))).resolves.toHaveLength(0);
      await expect(db.select().from(users).where(eq(users.id, second.id))).resolves.toHaveLength(0);
      await expect(db.select().from(users).where(eq(users.id, third.id))).resolves.toHaveLength(1);
      await expect(db.select().from(posts).where(eq(posts.id, thirdPost.id))).resolves.toHaveLength(
        1,
      );
      await expect(
        db.select().from(postComments).where(eq(postComments.postId, thirdPost.id)),
      ).resolves.toHaveLength(1);
      await expect(
        db.select().from(postLikes).where(eq(postLikes.postId, thirdPost.id)),
      ).resolves.toHaveLength(1);
      await expect(db.select().from(follows)).resolves.toHaveLength(0);
    },
  );
});

function socialIdentityVerifier(
  identity: Readonly<{
    provider: SocialProvider;
    providerUserId: string;
    email: string;
    emailVerified: true;
  }>,
): SocialIdentityVerifierPort {
  return { verify: async () => identity };
}

function tokenIssuerStub(): SessionTokenIssuerPort {
  let sequence = 0;
  return {
    issue: async () => {
      sequence += 1;
      return {
        accessToken: `access-${sequence}`,
        refreshToken: `refresh-${sequence}`,
        refreshTokenHash: tokenHash(),
        refreshTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      };
    },
  };
}

function unusedTokenVerifier(): AuthTokenVerifierPort {
  return {
    verifyAccess: async () => {
      throw new Error('verifyAccess is not used by login tests');
    },
    verifyRefresh: async () => {
      throw new Error('verifyRefresh is not used by login tests');
    },
  };
}

function tokenHash(): string {
  return randomUUID().replaceAll('-', '');
}

let executionSequence = 0;

function uniqueExecutionId(): number {
  executionSequence += 1;
  return Math.floor(Date.now() / 1_000) * 100_000 + executionSequence;
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
