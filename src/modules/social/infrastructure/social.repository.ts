import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { follows, jobs, users } from '../../../database/schema';

export type SocialUserRecord = Readonly<{ id: number }>;
export type SocialUserSummary = Readonly<{ nickname: string | null; job: string | null }>;

@Injectable()
export class SocialRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findUserByNickname(nickname: string): Promise<SocialUserRecord | null> {
    const user = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.nickname, nickname),
    });
    return user ?? null;
  }

  async createFollow(
    input: Readonly<{ followerId: number; followingId: number }>,
  ): Promise<boolean> {
    const [created] = await this.db
      .insert(follows)
      .values(input)
      .onConflictDoNothing({ target: [follows.followerId, follows.followingId] })
      .returning({ id: follows.id });
    return created !== undefined;
  }

  async deleteFollow(
    input: Readonly<{ followerId: number; followingId: number }>,
  ): Promise<boolean> {
    const deleted = await this.db
      .delete(follows)
      .where(andFollow(input))
      .returning({ id: follows.id });
    return deleted.length === 1;
  }

  async countMotos(userId: number): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.followingId, userId));
    return row?.value ?? 0;
  }

  async countMentors(userId: number): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return row?.value ?? 0;
  }

  async listMotos(userId: number): Promise<SocialUserSummary[]> {
    return this.db
      .select({ nickname: users.nickname, job: jobs.name })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(follows.followingId, userId));
  }

  async listMentors(userId: number): Promise<SocialUserSummary[]> {
    return this.db
      .select({ nickname: users.nickname, job: jobs.name })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(follows.followerId, userId));
  }
}

function andFollow(input: Readonly<{ followerId: number; followingId: number }>) {
  return and(eq(follows.followerId, input.followerId), eq(follows.followingId, input.followingId));
}
