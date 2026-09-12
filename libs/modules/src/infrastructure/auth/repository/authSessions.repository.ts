import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import { authSessions } from '../../database/schema';
import type { SessionRotationCommand } from '@core/auth/application/type/auth.command';
import { AuthPersistenceException } from '@core/auth/domain/exception/authPersistence.exception';
import type { AuthSessionRecord } from '../type/auth.record';
import { lockUsers } from '../../database/transactionLocks';

@Injectable()
export class AuthSessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(
    input: Omit<AuthSessionRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AuthSessionRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const locked = await lockUsers(tx, [input.userId]);
        if (locked.length !== 1) throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
        const [session] = await tx.insert(authSessions).values(input).returning();
        if (session === undefined) {
          throw new AuthPersistenceException('auth session insert did not return a row');
        }
        return session;
      });
    } catch (error: unknown) {
      if (error instanceof DomainException || error instanceof AuthPersistenceException) {
        throw error;
      }
      throw new AuthPersistenceException('Failed to create auth session record', { cause: error });
    }
  }

  async findActiveById(
    sessionId: string,
    now: Date = new Date(),
  ): Promise<AuthSessionRecord | null> {
    return (
      (await this.db.query.authSessions.findFirst({
        where: and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, now)),
      })) ?? null
    );
  }

  async deleteByIdAndUserId(sessionId: string, userId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockUsers(tx, [userId]);
      await tx
        .delete(authSessions)
        .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
    });
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockUsers(tx, [userId]);
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
    });
  }

  async rotate(input: SessionRotationCommand): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockUsers(tx, [input.userId]);
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
            eq(authSessions.userId, input.userId),
            eq(authSessions.refreshTokenHash, input.currentRefreshTokenHash),
            gt(authSessions.expiresAt, input.now),
          ),
        )
        .returning({ id: authSessions.id });
      return rows.length === 1;
    });
  }
}
