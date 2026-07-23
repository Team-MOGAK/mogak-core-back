import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import {
  addresses,
  follows,
  jobs,
  postComments,
  postImages,
  postLikes,
  posts,
  users,
} from '../../../database/schema';

export type SocialUserRecord = Readonly<{ id: number }>;
export type SocialUserSummary = Readonly<{ nickname: string | null; job: string | null }>;
export type FeedPostRecord = Readonly<{
  id: number;
  authorId: number;
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
  contents: string;
  likeCount: number;
  commentCount: number;
}>;
export type FeedImageRecord = Readonly<{ postId: number; storageKey: string }>;
export type FeedCommentRecord = Readonly<{
  id: number;
  postId: number;
  authorId: number;
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
  contents: string;
  createdAt: Date;
}>;

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

  async findAddressName(userId: number): Promise<string | null> {
    const [row] = await this.db
      .select({ name: addresses.name })
      .from(users)
      .leftJoin(addresses, eq(users.addressId, addresses.id))
      .where(eq(users.id, userId));
    return row?.name ?? null;
  }

  async listPacemakerPosts(input: Readonly<{ userId: number; limit: number; offset: number }>) {
    return this.db
      .select(feedProjection())
      .from(posts)
      .innerJoin(follows, eq(follows.followingId, posts.authorId))
      .innerJoin(users, eq(posts.authorId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(follows.followerId, input.userId))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(input.limit)
      .offset(input.offset);
  }

  async listNetworkPosts(
    input: Readonly<{
      address: string;
      sort: 'createdAt' | 'likeCnt';
      limit: number;
      offset: number;
    }>,
  ) {
    const projection = feedProjection();
    const order =
      input.sort === 'likeCnt'
        ? [desc(projection.likeCount), desc(posts.id)]
        : [desc(posts.createdAt), desc(posts.id)];
    return this.db
      .select(projection)
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .innerJoin(addresses, eq(users.addressId, addresses.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(addresses.name, input.address))
      .orderBy(...order)
      .limit(input.limit)
      .offset(input.offset);
  }

  async listImages(postIds: readonly number[]): Promise<FeedImageRecord[]> {
    if (postIds.length === 0) return [];
    return this.db
      .select({ postId: postImages.postId, storageKey: postImages.storageKey })
      .from(postImages)
      .where(inArray(postImages.postId, [...postIds]))
      .orderBy(asc(postImages.position), asc(postImages.id));
  }

  async listComments(postIds: readonly number[]): Promise<FeedCommentRecord[]> {
    if (postIds.length === 0) return [];
    return this.db
      .select({
        id: postComments.id,
        postId: postComments.postId,
        authorId: postComments.authorId,
        nickname: users.nickname,
        job: jobs.name,
        profileImageKey: users.profileImageKey,
        contents: postComments.contents,
        createdAt: postComments.createdAt,
      })
      .from(postComments)
      .innerJoin(users, eq(postComments.authorId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(inArray(postComments.postId, [...postIds]))
      .orderBy(asc(postComments.id));
  }
}

function andFollow(input: Readonly<{ followerId: number; followingId: number }>) {
  return and(eq(follows.followerId, input.followerId), eq(follows.followingId, input.followingId));
}

function feedProjection() {
  return {
    id: posts.id,
    authorId: posts.authorId,
    nickname: users.nickname,
    job: jobs.name,
    profileImageKey: users.profileImageKey,
    contents: posts.contents,
    likeCount: sql<number>`(select count(*)::integer from ${postLikes} where ${postLikes.postId} = ${posts.id})`,
    commentCount: sql<number>`(select count(*)::integer from ${postComments} where ${postComments.postId} = ${posts.id})`,
  };
}
