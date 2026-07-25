import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { UserRepositoryPort } from '../../application/port/user.repository.port';
import type {
  CompleteRegistrationCommand,
  UpdateJobCommand,
  UpdateNicknameCommand,
  UpdateProfileImageCommand,
} from '../../application/type/user.command';
import type { User } from '../../domain/entity/user.entity';
import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { authSessions, jobs, userConsents, users } from '../../../database/schema';
import type { UserProjection } from '../type/user.projection';

@Injectable()
export class DrizzleUserRepository implements UserRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async existsByNickname(nickname: string): Promise<boolean> {
    const row = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.nickname, nickname),
    });
    return row !== undefined;
  }

  async findById(userId: number): Promise<User | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    return user === undefined ? null : asUserRecord(user);
  }

  async findProfile(userId: number): Promise<UserProjection | null> {
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
    const updated = await this.db
      .update(users)
      .set({ nickname: command.nickname, updatedAt: command.now })
      .where(eq(users.id, command.userId))
      .returning({ id: users.id });
    return updated.length === 1;
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
    return this.db.transaction(async (tx) => {
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
        throw new Error('pending user registration update did not return a row');
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
  }
}

function asUserRecord(user: {
  id: number;
  jobId: number | null;
  addressId: number | null;
  nickname: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  role: string;
  profileImageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): User {
  if (user.role !== 'PENDING' && user.role !== 'USER') {
    throw new Error(`Unsupported persisted user role: ${user.role}`);
  }
  return {
    id: user.id,
    jobId: user.jobId,
    addressId: user.addressId,
    nickname: user.nickname,
    email: user.email,
    gender: user.gender,
    age: user.age,
    role: user.role,
    profileImageKey: user.profileImageKey,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
