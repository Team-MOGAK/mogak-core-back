import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { AuthTokenVerifierPort } from '@core/auth/application/port/authTokenVerifier.port';
import type { SessionTokenIssuerPort } from '@core/auth/application/port/sessionTokenIssuer.port';
import type { SocialIdentityVerifierPort } from '@core/auth/application/port/socialIdentityVerifier.port';
import { AuthService } from '@core/auth/application/service/auth.service';
import { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import { UserPersistenceException } from '@core/users/domain/exception/userPersistence.exception';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import { authSessions, socialAccounts, users } from '@infra/database/schema';
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
