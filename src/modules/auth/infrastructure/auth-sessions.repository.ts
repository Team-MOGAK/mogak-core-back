import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { authSessions } from '../../../database/schema';

type AuthSession = typeof authSessions.$inferSelect;

type CreateAuthSessionInput = Readonly<{
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: Date;
}>;

type RotateAuthSessionInput = Readonly<{
  sessionId: string;
  currentRefreshTokenHash: string;
  nextRefreshTokenHash: string;
  nextExpiresAt: Date;
  now: Date;
}>;

@Injectable()
export class AuthSessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: CreateAuthSessionInput): Promise<AuthSession> {
    const [session] = await this.db.insert(authSessions).values(input).returning();
    if (session === undefined) {
      throw new Error('auth session insert did not return a row');
    }
    return session;
  }

  async findActiveById(sessionId: string, now: Date = new Date()): Promise<AuthSession | null> {
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

  async rotate(input: RotateAuthSessionInput): Promise<boolean> {
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
