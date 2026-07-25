import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { authSessions, socialAccounts, users } from '../../../database/schema';
import type { AuthPersistencePort } from '../../application/port/auth-persistence.port';
import type { SessionRotationCommand } from '../../application/type/auth.command';
import type { AuthUser, SessionDraft } from '../../application/type/auth.result';
import type { UserRole } from '../../application/type/authenticated-principal';
import type { VerifiedSocialIdentity } from '../../domain/entity/auth.entity';

@Injectable()
export class DrizzleAuthRepository implements AuthPersistencePort {
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

  async createAccount<T>(
    input: Readonly<{ identity: VerifiedSocialIdentity }>,
    createSession: (user: AuthUser) => Promise<Readonly<{ result: T; session: SessionDraft }>>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({ email: input.identity.email, role: 'PENDING' })
        .returning();
      if (createdUser === undefined) throw new Error('user insert did not return a row');
      const user = asAuthUser(createdUser);
      await tx.insert(socialAccounts).values({
        userId: user.id,
        provider: input.identity.provider,
        providerUserId: input.identity.providerUserId,
        email: input.identity.email,
      });
      const prepared = await createSession(user);
      await tx.insert(authSessions).values({
        id: prepared.session.id,
        userId: user.id,
        refreshTokenHash: prepared.session.refreshTokenHash,
        expiresAt: prepared.session.expiresAt,
      });
      return prepared.result;
    });
  }

  async createSession(userId: number, session: SessionDraft): Promise<void> {
    await this.db.insert(authSessions).values({ ...session, userId });
  }

  async rotateSession(input: SessionRotationCommand): Promise<boolean> {
    const rows = await this.db
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
    await this.db
      .delete(authSessions)
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
  }

  async deleteUser(userId: number): Promise<boolean> {
    const deleted = await this.db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return deleted.length === 1;
  }
}

function asAuthUser(user: {
  id: number;
  email: string | null;
  nickname: string | null;
  role: string;
}): AuthUser {
  return { id: user.id, email: user.email, nickname: user.nickname, role: asUserRole(user.role) };
}

function asUserRole(value: string): UserRole {
  if (value === 'PENDING' || value === 'USER') return value;
  throw new Error(`Unsupported persisted user role: ${value}`);
}
