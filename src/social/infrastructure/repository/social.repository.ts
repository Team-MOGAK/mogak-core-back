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
import type { SocialRepositoryPort } from '../../application/port/social.repository.port';
import type { FollowCommand } from '../../application/type/social.command';
import type { NetworkPostsQuery, PacemakerPostsQuery } from '../../application/type/social.query';
import type {
  FeedCommentResult,
  FeedImageResult,
  FeedPostResult,
  SocialUserResult,
  SocialUserSummaryResult,
} from '../../application/type/social.result';
import type {
  FeedCommentProjection,
  FeedImageProjection,
  FeedPostProjection,
} from '../type/social.projection';

@Injectable()
export class SocialRepository implements SocialRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findUserByNickname(nickname: string): Promise<SocialUserResult | null> {
    const user = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.nickname, nickname),
    });
    return user ?? null;
  }

  async createFollow(command: FollowCommand): Promise<boolean> {
    const [created] = await this.db
      .insert(follows)
      .values(command)
      .onConflictDoNothing({ target: [follows.followerId, follows.followingId] })
      .returning({ id: follows.id });
    return created !== undefined;
  }

  async deleteFollow(command: FollowCommand): Promise<boolean> {
    const deleted = await this.db
      .delete(follows)
      .where(andFollow(command))
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

  async listMotos(userId: number): Promise<SocialUserSummaryResult[]> {
    return this.db
      .select({ nickname: users.nickname, job: jobs.name })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(follows.followingId, userId));
  }

  async listMentors(userId: number): Promise<SocialUserSummaryResult[]> {
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

  async listPacemakerPosts(query: PacemakerPostsQuery): Promise<FeedPostResult[]> {
    const rows = await this.db
      .select(feedProjection())
      .from(posts)
      .innerJoin(follows, eq(follows.followingId, posts.authorId))
      .innerJoin(users, eq(posts.authorId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(follows.followerId, query.userId))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(query.limit)
      .offset(query.offset);
    return rows.map(toFeedPostResult);
  }

  async listNetworkPosts(query: NetworkPostsQuery): Promise<FeedPostResult[]> {
    const projection = feedProjection();
    const order =
      query.sort === 'likeCnt'
        ? [desc(projection.likeCount), desc(posts.id)]
        : [desc(posts.createdAt), desc(posts.id)];
    const rows = await this.db
      .select(projection)
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .innerJoin(addresses, eq(users.addressId, addresses.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(addresses.name, query.address))
      .orderBy(...order)
      .limit(query.limit)
      .offset(query.offset);
    return rows.map(toFeedPostResult);
  }

  async listImages(postIds: readonly number[]): Promise<FeedImageResult[]> {
    if (postIds.length === 0) return [];
    const rows = await this.db
      .select({ postId: postImages.postId, storageKey: postImages.storageKey })
      .from(postImages)
      .where(inArray(postImages.postId, [...postIds]))
      .orderBy(asc(postImages.position), asc(postImages.id));
    return rows.map(toFeedImageResult);
  }

  async listComments(postIds: readonly number[]): Promise<FeedCommentResult[]> {
    if (postIds.length === 0) return [];
    const rows = await this.db
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
    return rows.map(toFeedCommentResult);
  }
}

function andFollow(command: FollowCommand) {
  return and(
    eq(follows.followerId, command.followerId),
    eq(follows.followingId, command.followingId),
  );
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

function toFeedPostResult(row: FeedPostProjection): FeedPostResult {
  return { ...row };
}

function toFeedImageResult(row: FeedImageProjection): FeedImageResult {
  return { ...row };
}

function toFeedCommentResult(row: FeedCommentProjection): FeedCommentResult {
  return { ...row };
}
