import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { UserRepositoryPort } from '../../application/port/user.repository.port';
import type {
  CompleteRegistrationCommand,
  UpdateJobCommand,
  UpdateNicknameCommand,
  UpdateProfileImageCommand,
} from '../../application/type/user.command';
import {
  DuplicateNicknameException,
  UserPersistenceException,
} from '../../domain/exception/userPersistence.exception';
import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { authSessions, jobs, userConsents, users } from '../../../database/schema';
import type { UserRecord } from '../type/user.record';
import type {
  RegistrationCandidate,
  UserProfileProjection,
} from '../../application/type/user.result';

@Injectable()
export class UserRepository implements UserRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async existsByNickname(nickname: string): Promise<boolean> {
    const row = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.nickname, nickname),
    });
    return row !== undefined;
  }

  async findById(userId: number): Promise<RegistrationCandidate | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    return user === undefined ? null : asRegistrationCandidate(user);
  }

  async findProfile(userId: number): Promise<UserProfileProjection | null> {
    const [profile] = await this.db
      .select({
        nickname: users.nickname,
        job: jobs.name,
        profileImageKey: users.profileImageKey,
      })
      .from(users)
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(users.id, userId));
    return profile ?? null;
  }

  async updateNickname(command: UpdateNicknameCommand): Promise<boolean> {
    try {
      const updated = await this.db
        .update(users)
        .set({ nickname: command.nickname, updatedAt: command.now })
        .where(eq(users.id, command.userId))
        .returning({ id: users.id });
      return updated.length === 1;
    } catch (error: unknown) {
      throw asUserPersistenceException(error, 'Failed to update user nickname');
    }
  }

  async updateJob(command: UpdateJobCommand): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set({ jobId: command.jobId, updatedAt: command.now })
      .where(eq(users.id, command.userId))
      .returning({ id: users.id });
    return updated.length === 1;
  }

  async updateProfileImageKey(command: UpdateProfileImageCommand): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set({ profileImageKey: command.profileImageKey, updatedAt: command.now })
      .where(eq(users.id, command.userId))
      .returning({ id: users.id });
    return updated.length === 1;
  }

  async completeRegistration(
    command: CompleteRegistrationCommand,
  ): Promise<Readonly<{ id: number; nickname: string }>> {
    try {
      return await this.db.transaction(async (tx) => {
        const [registered] = await tx
          .update(users)
          .set({
            nickname: command.nickname,
            jobId: command.jobId,
            addressId: command.addressId,
            role: 'USER',
            updatedAt: command.now,
          })
          .where(and(eq(users.id, command.userId), eq(users.role, 'PENDING')))
          .returning({ id: users.id, nickname: users.nickname });
        const nickname = registered?.nickname;
        if (registered === undefined || nickname === null || nickname === undefined) {
          throw new UserPersistenceException(
            'Pending user registration update did not return a row',
          );
        }

        for (const consent of command.consents) {
          await tx
            .insert(userConsents)
            .values({
              userId: command.userId,
              consentItemId: consent.consentItemId,
              agreed: consent.agreed,
              agreedAt: consent.agreed ? command.now : null,
              withdrawnAt: consent.agreed ? null : command.now,
            })
            .onConflictDoUpdate({
              target: [userConsents.userId, userConsents.consentItemId],
              set: {
                agreed: consent.agreed,
                agreedAt: consent.agreed ? command.now : null,
                withdrawnAt: consent.agreed ? null : command.now,
                updatedAt: command.now,
              },
            });
        }

        await tx.insert(authSessions).values({
          id: command.replacementSession.id,
          userId: command.userId,
          refreshTokenHash: command.replacementSession.refreshTokenHash,
          expiresAt: command.replacementSession.expiresAt,
        });
        await tx
          .delete(authSessions)
          .where(
            and(
              eq(authSessions.id, command.currentSessionId),
              eq(authSessions.userId, command.userId),
            ),
          );
        return { id: registered.id, nickname };
      });
    } catch (error: unknown) {
      throw asUserPersistenceException(error, 'Failed to complete user registration');
    }
  }
}

function asRegistrationCandidate(user: UserRecord): RegistrationCandidate {
  if (user.role !== 'PENDING' && user.role !== 'USER') {
    throw new UserPersistenceException(`Unsupported persisted user role: ${user.role}`);
  }
  return { id: user.id, email: user.email, role: user.role };
}

function asUserPersistenceException(error: unknown, message: string): UserPersistenceException {
  if (error instanceof UserPersistenceException) return error;
  if (isNicknameUniqueConstraint(error)) return new DuplicateNicknameException();
  return new UserPersistenceException(message, { cause: error });
}

function isNicknameUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'users_nickname_unique'
  );
}
