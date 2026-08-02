import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { authSessions } from '../../../database/schema';
import type { SessionRotationCommand } from '../../application/type/auth.command';
import { AuthPersistenceException } from '../../domain/exception/authPersistence.exception';
import type { AuthSessionRecord } from '../type/auth.record';

@Injectable()
export class AuthSessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(
    input: Omit<AuthSessionRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AuthSessionRecord> {
    try {
      const [session] = await this.db.insert(authSessions).values(input).returning();
      if (session === undefined) {
        throw new AuthPersistenceException('auth session insert did not return a row');
      }
      return session;
    } catch (error: unknown) {
      if (error instanceof AuthPersistenceException) {
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
    await this.db
      .delete(authSessions)
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.userId, userId));
  }

  async rotate(input: SessionRotationCommand): Promise<boolean> {
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
}
