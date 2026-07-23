import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { addresses, authSessions, jobs, userConsents, users } from '../../../database/schema';
import type { UserRole } from '../../auth/domain/authenticated-user';

export type UserRecord = Readonly<{
  id: number;
  email: string | null;
  nickname: string | null;
  role: UserRole;
}>;

export type MetadataItem = Readonly<{ id: number; name: string }>;

export type ProfileRecord = Readonly<{
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
}>;

export type ConsentCommand = Readonly<{ consentItemId: number; agreed: boolean }>;

export type CompleteRegistrationInput = Readonly<{
  userId: number;
  nickname: string;
  jobId: number;
  addressId: number;
  consents: readonly ConsentCommand[];
  currentSessionId: string;
  replacementSession: Readonly<{
    id: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }>;
  now: Date;
}>;

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async existsByNickname(nickname: string): Promise<boolean> {
    const row = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.nickname, nickname),
    });
    return row !== undefined;
  }

  async findById(userId: number): Promise<UserRecord | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    return user === undefined ? null : asUserRecord(user);
  }

  async findJobByName(name: string): Promise<MetadataItem | null> {
    const job = await this.db.query.jobs.findFirst({ where: eq(jobs.name, name) });
    return job === undefined ? null : job;
  }

  async findAddressByName(name: string): Promise<MetadataItem | null> {
    const address = await this.db.query.addresses.findFirst({ where: eq(addresses.name, name) });
    return address === undefined ? null : address;
  }

  async findProfile(userId: number): Promise<ProfileRecord | null> {
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

  async updateNickname(userId: number, nickname: string, now: Date): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set({ nickname, updatedAt: now })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return updated.length === 1;
  }

  async updateJob(userId: number, jobId: number, now: Date): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set({ jobId, updatedAt: now })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return updated.length === 1;
  }

  async updateProfileImageKey(
    userId: number,
    profileImageKey: string | null,
    now: Date,
  ): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set({ profileImageKey, updatedAt: now })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return updated.length === 1;
  }

  async completeRegistration(
    input: CompleteRegistrationInput,
  ): Promise<Readonly<{ id: number; nickname: string }>> {
    return this.db.transaction(async (tx) => {
      const [registered] = await tx
        .update(users)
        .set({
          nickname: input.nickname,
          jobId: input.jobId,
          addressId: input.addressId,
          role: 'USER',
          updatedAt: input.now,
        })
        .where(and(eq(users.id, input.userId), eq(users.role, 'PENDING')))
        .returning({ id: users.id, nickname: users.nickname });
      const nickname = registered?.nickname;
      if (registered === undefined || nickname === null || nickname === undefined) {
        throw new Error('pending user registration update did not return a row');
      }

      for (const consent of input.consents) {
        await tx
          .insert(userConsents)
          .values({
            userId: input.userId,
            consentItemId: consent.consentItemId,
            agreed: consent.agreed,
            agreedAt: consent.agreed ? input.now : null,
            withdrawnAt: consent.agreed ? null : input.now,
          })
          .onConflictDoUpdate({
            target: [userConsents.userId, userConsents.consentItemId],
            set: {
              agreed: consent.agreed,
              agreedAt: consent.agreed ? input.now : null,
              withdrawnAt: consent.agreed ? null : input.now,
              updatedAt: input.now,
            },
          });
      }

      await tx.insert(authSessions).values({
        id: input.replacementSession.id,
        userId: input.userId,
        refreshTokenHash: input.replacementSession.refreshTokenHash,
        expiresAt: input.replacementSession.expiresAt,
      });
      await tx
        .delete(authSessions)
        .where(
          and(eq(authSessions.id, input.currentSessionId), eq(authSessions.userId, input.userId)),
        );

      return { id: registered.id, nickname };
    });
  }
}

function asUserRecord(user: {
  id: number;
  email: string | null;
  nickname: string | null;
  role: string;
}): UserRecord {
  if (user.role !== 'PENDING' && user.role !== 'USER') {
    throw new Error(`Unsupported persisted user role: ${user.role}`);
  }
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
  };
}
