import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import {
  authSessions,
  consentItems,
  socialAccounts,
  userConsents,
  users,
} from '@infra/database/schema';
import type { Database } from '@infra/database/database.provider';
import { DATABASE } from '@infra/database/database.tokens';
import { lockUsersForTransaction } from '@infra/database/transaction/userAdvisoryLock';
import type { AuthPersistencePort } from '@core/auth/application/port/authPersistence.port';
import type { SessionRotationCommand } from '@core/auth/application/type/auth.command';
import type { AuthUser, SessionDraft } from '@core/auth/application/type/auth.result';
import type { UserRole } from '@core/auth/application/type/authenticatedPrincipal';
import type { VerifiedSocialIdentity } from '@core/auth/domain/vo/verifiedSocialIdentity.vo';
import type {
  RegistrationRole,
  RegistrationSnapshot,
} from '@core/users/domain/policy/userRegistration.policy';
import {
  AuthPersistenceException,
  DuplicateEmailException,
  DuplicateSocialAccountException,
  SessionUserNotFoundAfterLockException,
} from '@core/auth/domain/exception/authPersistence.exception';

@Injectable()
export class AuthRepository implements AuthPersistencePort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findUserById(userId: number): Promise<AuthUser | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    return user === undefined ? null : asAuthUser(user);
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });
    return user === undefined ? null : asAuthUser(user);
  }

  async findUserBySocialIdentity(
    provider: VerifiedSocialIdentity['provider'],
    providerUserId: string,
  ): Promise<AuthUser | null> {
    const [row] = await this.db
      .select({ id: users.id, email: users.email, nickname: users.nickname, role: users.role })
      .from(socialAccounts)
      .innerJoin(users, eq(socialAccounts.userId, users.id))
      .where(
        and(
          eq(socialAccounts.provider, provider),
          eq(socialAccounts.providerUserId, providerUserId),
        ),
      );
    return row === undefined ? null : asAuthUser(row);
  }

  async findRegistrationSnapshot(userId: number): Promise<RegistrationSnapshot> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (user === undefined) {
      throw new AuthPersistenceException('user disappeared while reading registration snapshot');
    }

    const requiredConsents = await this.db
      .select({ agreed: userConsents.agreed })
      .from(consentItems)
      .leftJoin(
        userConsents,
        and(eq(userConsents.consentItemId, consentItems.id), eq(userConsents.userId, userId)),
      )
      .where(and(eq(consentItems.active, true), eq(consentItems.required, true)));

    return {
      nickname: user.nickname,
      jobId: user.jobId,
      addressId: user.addressId,
      requiredConsentAgreements: requiredConsents.map((consent) => consent.agreed === true),
    };
  }

  async normalizeNullRole(userId: number, role: RegistrationRole): Promise<AuthUser> {
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [userId]);
      await tx
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.role)));

      const [normalized] = await tx.select().from(users).where(eq(users.id, userId));
      if (normalized === undefined || normalized.role === null) {
        throw new AuthPersistenceException('null user role was not normalized');
      }
      return asAuthUser(normalized);
    });
  }

  async createAccount(identity: VerifiedSocialIdentity): Promise<AuthUser> {
    try {
      return await this.db.transaction(async (tx) => {
        const [createdUser] = await tx
          .insert(users)
          .values({ email: identity.email, role: 'PENDING' })
          .returning();
        if (createdUser === undefined) {
          throw new AuthPersistenceException('user insert did not return a row');
        }

        const user = asAuthUser(createdUser);
        await tx.insert(socialAccounts).values({
          userId: user.id,
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          email: identity.email,
        });

        return user;
      });
    } catch (error: unknown) {
      if (error instanceof AuthPersistenceException) {
        throw error;
      }
      if (isUniqueConstraint(error, 'users_email_unique')) {
        throw new DuplicateEmailException();
      }
      if (
        isUniqueConstraint(
          error,
          'uq_social_account_provider_user',
          'social_accounts_provider_user_unique',
        )
      ) {
        throw new DuplicateSocialAccountException();
      }
      throw new AuthPersistenceException('Failed to create auth account', { cause: error });
    }
  }

  async createSession(userId: number, session: SessionDraft): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await lockUsersForTransaction(tx, [userId]);
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
        if (user === undefined) throw new SessionUserNotFoundAfterLockException();
        await tx.insert(authSessions).values({ ...session, userId });
      });
    } catch (error: unknown) {
      if (error instanceof AuthPersistenceException) {
        throw error;
      }
      throw new AuthPersistenceException('Failed to create auth session', { cause: error });
    }
  }

  async rotateSession(input: SessionRotationCommand): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select({ userId: authSessions.userId })
        .from(authSessions)
        .where(eq(authSessions.id, input.sessionId));
      if (session === undefined) return false;
      await lockUsersForTransaction(tx, [session.userId]);
      const rows = await tx
        .update(authSessions)
        .set({
          refreshTokenHash: input.nextRefreshTokenHash,
          expiresAt: input.nextExpiresAt,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(authSessions.id, input.sessionId),
            eq(authSessions.refreshTokenHash, input.currentRefreshTokenHash),
            gt(authSessions.expiresAt, input.now),
          ),
        )
        .returning({ id: authSessions.id });
      return rows.length === 1;
    });
  }

  async isSessionActive(sessionId: string, userId: number): Promise<boolean> {
    const session = await this.db.query.authSessions.findFirst({
      where: and(
        eq(authSessions.id, sessionId),
        eq(authSessions.userId, userId),
        gt(authSessions.expiresAt, new Date()),
      ),
    });
    return session !== undefined;
  }

  async deleteSession(sessionId: string, userId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [userId]);
      await tx
        .delete(authSessions)
        .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
    });
  }

  async deleteUser(userId: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const related = await tx.execute<{ user_id: number }>(sql`
        with target_posts as (
          select p.post_id from post p where p.user_id = ${userId}
          union
          select p.post_id from post p join daily_jogak d on d.daily_jogak_id = p.daily_jogak_id
            join jogak j on j.jogak_id = d.jogak_id join mogak m on m.mogak_id = j.mogak_id
            join modarat r on r.modarat_id = m.modarat_id where r.user_id = ${userId}
        )
        select ${userId}::bigint as user_id
        union select p.user_id from post p join target_posts t on t.post_id = p.post_id
        union select c.user_id from post_comment c join target_posts t on t.post_id = c.post_id
        union select l.user_id from post_like l join target_posts t on t.post_id = l.post_id
        union select from_id from follow where from_id = ${userId} or to_id = ${userId}
        union select to_id from follow where from_id = ${userId} or to_id = ${userId}
      `);
      await lockUsersForTransaction(
        tx,
        related.rows.map((row) => Number(row.user_id)),
      );

      // The lock union is deliberately read before locking then every delete
      // predicate is re-evaluated below; no JavaScript ID list or IN binding is
      // used, so a large account cannot exceed PostgreSQL bind limits.
      const targetPosts = sql`
        select p.post_id from post p where p.user_id = ${userId}
        union
        select p.post_id from post p join daily_jogak d on d.daily_jogak_id = p.daily_jogak_id
          join jogak j on j.jogak_id = d.jogak_id join mogak m on m.mogak_id = j.mogak_id
          join modarat r on r.modarat_id = m.modarat_id where r.user_id = ${userId}`;
      await tx.execute(sql`delete from post_img where post_id in (${targetPosts})`);
      await tx.execute(
        sql`delete from post_comment where post_id in (${targetPosts}) or user_id = ${userId}`,
      );
      await tx.execute(
        sql`delete from post_like where post_id in (${targetPosts}) or user_id = ${userId}`,
      );
      await tx.execute(sql`delete from post where post_id in (${targetPosts})`);
      await tx.execute(
        sql`delete from jogak_schedule_weekdays w using jogak_schedules s, jogak j, mogak m, modarat r where w.schedule_id=s.id and s.jogak_id=j.jogak_id and j.mogak_id=m.mogak_id and m.modarat_id=r.modarat_id and r.user_id=${userId}`,
      );
      await tx.execute(
        sql`delete from jogak_schedules s using jogak j, mogak m, modarat r where s.jogak_id=j.jogak_id and j.mogak_id=m.mogak_id and m.modarat_id=r.modarat_id and r.user_id=${userId}`,
      );
      await tx.execute(
        sql`delete from daily_jogak d using jogak j, mogak m, modarat r where d.jogak_id=j.jogak_id and j.mogak_id=m.mogak_id and m.modarat_id=r.modarat_id and r.user_id=${userId}`,
      );
      await tx.execute(
        sql`delete from jogak j using mogak m, modarat r where j.mogak_id=m.mogak_id and m.modarat_id=r.modarat_id and r.user_id=${userId}`,
      );
      await tx.execute(
        sql`delete from mogak m using modarat r where m.modarat_id=r.modarat_id and r.user_id=${userId}`,
      );
      await tx.execute(sql`delete from modarat where user_id=${userId}`);
      await tx.execute(sql`delete from follow where from_id=${userId} or to_id=${userId}`);
      await tx.execute(sql`delete from auth_sessions where user_id=${userId}`);
      await tx.execute(sql`delete from social_account where user_id=${userId}`);
      await tx.execute(sql`delete from user_consent where user_id=${userId}`);
      const deleted = await tx.execute<{ user_id: number }>(
        sql`delete from users where user_id=${userId} returning user_id`,
      );
      return deleted.rows.length === 1;
    });
  }
}

function asAuthUser(user: {
  id: number;
  email: string | null;
  nickname: string | null;
  role: string | null;
}): AuthUser {
  return { id: user.id, email: user.email, nickname: user.nickname, role: asUserRole(user.role) };
}

function asUserRole(value: string | null): UserRole | null {
  if (value === null) return null;
  if (value === 'PENDING' || value === 'USER') return value;
  throw new AuthPersistenceException(`Unsupported persisted user role: ${value}`);
}

function isUniqueConstraint(error: unknown, ...constraints: readonly string[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    typeof error.constraint === 'string' &&
    constraints.includes(error.constraint)
  );
}
