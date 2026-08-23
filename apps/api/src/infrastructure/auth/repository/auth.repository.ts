import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';

import {
  authSessions,
  consentItems,
  follows,
  jogakExecutions,
  jogakSchedules,
  jogakScheduleWeekdays,
  jogaks,
  modarats,
  mogaks,
  postComments,
  postImages,
  postLikes,
  posts,
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
} from '@core/auth/domain/exception/authPersistence.exception';

@Injectable()
export class AuthRepository implements AuthPersistencePort {
  private readonly logger = new Logger(AuthRepository.name);

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
        if (user === undefined) {
          this.logger.warn({
            event: 'resource_not_found_after_user_lock',
            resource: 'USER',
            operation: 'create_session',
          });
          throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
        }
        await tx.insert(authSessions).values({ ...session, userId });
      });
    } catch (error: unknown) {
      if (error instanceof AuthPersistenceException || error instanceof DomainException) {
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
      const targetPostIds = withdrawalTargetPostIds(tx, userId);
      const targetPosts = tx.$with('target_posts').as(targetPostIds);
      const relatedUsers = unionAll(
        tx
          .select({ userId: posts.authorId })
          .from(posts)
          .innerJoin(targetPosts, eq(posts.id, targetPosts.id)),
        tx
          .select({ userId: postComments.authorId })
          .from(postComments)
          .innerJoin(targetPosts, eq(postComments.postId, targetPosts.id)),
        tx
          .select({ userId: postLikes.userId })
          .from(postLikes)
          .innerJoin(targetPosts, eq(postLikes.postId, targetPosts.id)),
        tx
          .select({ userId: follows.followerId })
          .from(follows)
          .where(eq(follows.followerId, userId)),
        tx
          .select({ userId: follows.followingId })
          .from(follows)
          .where(eq(follows.followingId, userId)),
      ).as('related_users');
      const related = await tx
        .with(targetPosts)
        .select({ userId: relatedUsers.userId })
        .from(relatedUsers);
      await lockUsersForTransaction(tx, [userId, ...related.map((row) => row.userId)]);

      const ownedMogakIds = withdrawalOwnedMogakIds(tx, userId);
      const ownedJogakIds = tx
        .select({ id: jogaks.id })
        .from(jogaks)
        .where(inArray(jogaks.mogakId, ownedMogakIds));
      const ownedScheduleIds = tx
        .select({ id: jogakSchedules.id })
        .from(jogakSchedules)
        .where(inArray(jogakSchedules.jogakId, ownedJogakIds));

      await tx.delete(postImages).where(inArray(postImages.postId, targetPostIds));
      await tx
        .delete(postComments)
        .where(or(inArray(postComments.postId, targetPostIds), eq(postComments.authorId, userId)));
      await tx
        .delete(postLikes)
        .where(or(inArray(postLikes.postId, targetPostIds), eq(postLikes.userId, userId)));
      await tx.delete(posts).where(inArray(posts.id, targetPostIds));
      await tx
        .delete(jogakScheduleWeekdays)
        .where(inArray(jogakScheduleWeekdays.scheduleId, ownedScheduleIds));
      await tx.delete(jogakSchedules).where(inArray(jogakSchedules.jogakId, ownedJogakIds));
      await tx.delete(jogakExecutions).where(inArray(jogakExecutions.jogakId, ownedJogakIds));
      await tx.delete(jogaks).where(inArray(jogaks.mogakId, ownedMogakIds));
      await tx.delete(mogaks).where(inArray(mogaks.id, ownedMogakIds));
      await tx.delete(modarats).where(eq(modarats.userId, userId));
      await tx
        .delete(follows)
        .where(or(eq(follows.followerId, userId), eq(follows.followingId, userId)));
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      await tx.delete(socialAccounts).where(eq(socialAccounts.userId, userId));
      await tx.delete(userConsents).where(eq(userConsents.userId, userId));
      const deleted = await tx
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      return deleted.length === 1;
    });
  }
}

function withdrawalOwnedMogakIds(tx: Pick<Database, 'select'>, userId: number) {
  return tx
    .select({ id: mogaks.id })
    .from(mogaks)
    .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
    .where(eq(modarats.userId, userId));
}

function withdrawalTargetPostIds(tx: Pick<Database, 'select'>, userId: number) {
  const ownedExecutionIds = tx
    .select({ id: jogakExecutions.id })
    .from(jogakExecutions)
    .innerJoin(jogaks, eq(jogakExecutions.jogakId, jogaks.id))
    .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
    .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
    .where(eq(modarats.userId, userId));
  return tx
    .select({ id: posts.id })
    .from(posts)
    .where(or(eq(posts.authorId, userId), inArray(posts.jogakExecutionId, ownedExecutionIds)));
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
