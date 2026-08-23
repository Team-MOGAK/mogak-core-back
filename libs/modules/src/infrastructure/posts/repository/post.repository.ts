import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { InjectPinoLogger } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';

import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import {
  jobs,
  jogakExecutions,
  jogaks,
  modarats,
  mogaks,
  postComments,
  postImages,
  postLikes,
  posts,
  users,
} from '../../database/schema';
import type { PostRepositoryPort } from '@core/posts/application/port/post.repository.port';
import type { CreatePostCommand } from '@core/posts/application/type/post.command';
import { PostPersistenceException } from '@core/posts/domain/exception/postPersistence.exception';
import type {
  PostCommentResult,
  PostDetailResult,
  PostImageResult,
  ToggleLikeResult,
} from '@core/posts/application/type/post.result';
import type {
  CreatedPostRow,
  PostCommentRow,
  PostDetailRow,
  PostImageRow,
} from '../type/post.projection';

type CreatePostForOccurrenceInput = CreatePostCommand & Readonly<{ jogakTitleSnapshot: string }>;
type CreatePostForOccurrenceResult =
  Readonly<{ type: 'CREATED'; post: CreatedPostRow }> | Readonly<{ type: 'DUPLICATE' }>;
type PostRecord = Readonly<{ id: number }>;
type UpdatedPostRecord = Readonly<{ id: number; contents: string; updatedAt: Date }>;

@Injectable()
export class PostRepository implements PostRepositoryPort {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @InjectPinoLogger(PostRepository.name) private readonly logger: PinoLogger,
  ) {}

  async createForOccurrence(
    input: CreatePostForOccurrenceInput,
  ): Promise<CreatePostForOccurrenceResult> {
    return this.db.transaction(async (tx) => {
      const [stillOwned] = await tx
        .select({ id: jogaks.id })
        .from(jogaks)
        .where(eq(jogaks.id, input.jogakId));
      if (stillOwned === undefined) {
        this.logger.warn({
          event: 'jogak_not_found_after_lock',
          operation: 'create_post_for_occurrence',
        });
        throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
      }
      const [author] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.authorId));
      if (author === undefined) {
        this.logger.warn({
          event: 'user_not_found_after_lock',
          operation: 'create_post_for_occurrence',
        });
        throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
      }
      const [insertedExecution] = await tx
        .insert(jogakExecutions)
        .values({
          jogakId: input.jogakId,
          scheduledDate: input.scheduledDate,
          status: 'IN_PROGRESS',
          jogakTitleSnapshot: input.jogakTitleSnapshot,
        })
        .onConflictDoNothing({ target: [jogakExecutions.jogakId, jogakExecutions.scheduledDate] })
        .returning({ id: jogakExecutions.id });

      const execution =
        insertedExecution ??
        (
          await tx
            .select({ id: jogakExecutions.id })
            .from(jogakExecutions)
            .where(
              and(
                eq(jogakExecutions.jogakId, input.jogakId),
                eq(jogakExecutions.scheduledDate, input.scheduledDate),
              ),
            )
        )[0];
      if (execution === undefined) {
        throw new PostPersistenceException(
          'execution insert conflict did not expose an execution row',
        );
      }

      const [post] = await tx
        .insert(posts)
        .values({
          jogakExecutionId: execution.id,
          authorId: input.authorId,
          contents: input.contents,
        })
        .onConflictDoNothing({ target: posts.jogakExecutionId })
        .returning({
          id: posts.id,
          jogakExecutionId: posts.jogakExecutionId,
          authorId: posts.authorId,
          contents: posts.contents,
          createdAt: posts.createdAt,
        });
      if (post === undefined) return { type: 'DUPLICATE' };

      return {
        type: 'CREATED',
        post: {
          ...post,
          jogakId: input.jogakId,
          scheduledDate: input.scheduledDate,
        },
      };
    });
  }

  async findPost(postId: number): Promise<PostRecord | null> {
    const post = await this.db.query.posts.findFirst({
      columns: { id: true },
      where: eq(posts.id, postId),
    });
    return post ?? null;
  }

  async updateOwnedPost(
    input: Readonly<{
      postId: number;
      authorId: number;
      contents: string;
      now: Date;
    }>,
  ): Promise<UpdatedPostRecord | null> {
    return this.db.transaction(async (tx) => {
      const [post] = await tx
        .update(posts)
        .set({ contents: input.contents, updatedAt: input.now })
        .where(and(eq(posts.id, input.postId), eq(posts.authorId, input.authorId)))
        .returning({ id: posts.id, contents: posts.contents, updatedAt: posts.updatedAt });
      return post ?? null;
    });
  }

  async deleteOwnedPost(input: Readonly<{ postId: number; authorId: number }>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Explicit child cleanup keeps normal post deletion independent of the
      // database's FK cascade just like withdrawal does.
      const [owned] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.id, input.postId), eq(posts.authorId, input.authorId)));
      if (owned === undefined) return false;
      await tx.delete(postImages).where(eq(postImages.postId, input.postId));
      await tx.delete(postComments).where(eq(postComments.postId, input.postId));
      await tx.delete(postLikes).where(eq(postLikes.postId, input.postId));
      const deleted = await tx
        .delete(posts)
        .where(eq(posts.id, input.postId))
        .returning({ id: posts.id });
      return deleted.length === 1;
    });
  }

  async findOwnedPostByOccurrence(
    userId: number,
    jogakId: number,
    scheduledDate: string,
  ): Promise<PostDetailResult | null> {
    const [post] = await this.db
      .select(postDetailProjection())
      .from(posts)
      .innerJoin(jogakExecutions, eq(posts.jogakExecutionId, jogakExecutions.id))
      .innerJoin(jogaks, eq(jogakExecutions.jogakId, jogaks.id))
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .where(
        and(
          eq(posts.authorId, userId),
          eq(jogakExecutions.jogakId, jogakId),
          eq(jogakExecutions.scheduledDate, scheduledDate),
        ),
      );
    return post === undefined ? null : toPostDetailResult(post);
  }

  async findOwnedPost(userId: number, postId: number): Promise<PostDetailResult | null> {
    const [post] = await this.db
      .select(postDetailProjection())
      .from(posts)
      .leftJoin(jogakExecutions, eq(posts.jogakExecutionId, jogakExecutions.id))
      .leftJoin(jogaks, eq(jogakExecutions.jogakId, jogaks.id))
      .leftJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .where(and(eq(posts.id, postId), eq(posts.authorId, userId)));
    return post === undefined ? null : toPostDetailResult(post);
  }

  async listOwnedMogakPosts(
    input: Readonly<{
      userId: number;
      mogakId: number;
      limit: number;
      offset: number;
    }>,
  ): Promise<PostDetailResult[]> {
    const rows = await this.db
      .select(postDetailProjection())
      .from(posts)
      .innerJoin(jogakExecutions, eq(posts.jogakExecutionId, jogakExecutions.id))
      .innerJoin(jogaks, eq(jogakExecutions.jogakId, jogaks.id))
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .where(and(eq(modarats.userId, input.userId), eq(mogaks.id, input.mogakId)))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(input.limit)
      .offset(input.offset);
    return rows.map(toPostDetailResult);
  }

  async listImagesForPosts(postIds: readonly number[]): Promise<PostImageResult[]> {
    if (postIds.length === 0) return [];
    const rows = await this.db
      .select({
        postId: postImages.postId,
        storageKey: postImages.storageKey,
        position: postImages.position,
      })
      .from(postImages)
      .where(inArray(postImages.postId, [...postIds]))
      .orderBy(asc(postImages.position), asc(postImages.id));
    return rows.map(toPostImageResult);
  }

  async listCommentIds(postId: number): Promise<number[]> {
    const comments = await this.db
      .select({ id: postComments.id })
      .from(postComments)
      .where(eq(postComments.postId, postId))
      .orderBy(asc(postComments.id));
    return comments.map((comment) => comment.id);
  }

  async toggleLike(input: Readonly<{ postId: number; userId: number }>): Promise<ToggleLikeResult> {
    return this.db.transaction(async (tx) => {
      // Re-read after locks: withdrawal may have deleted the post while this
      // request was waiting.
      const [post] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, input.postId));
      if (post === undefined) {
        this.logger.warn({
          event: 'post_not_found_after_lock',
          operation: 'toggle_like',
        });
        throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
      }
      const [actor] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId));
      if (actor === undefined) {
        this.logger.warn({
          event: 'user_not_found_after_lock',
          operation: 'toggle_like',
        });
        throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
      }
      const [created] = await tx
        .insert(postLikes)
        .values(input)
        .onConflictDoNothing({ target: [postLikes.postId, postLikes.userId] })
        .returning({ id: postLikes.id });
      if (created !== undefined) return 'CREATED';
      await tx
        .delete(postLikes)
        .where(and(eq(postLikes.postId, input.postId), eq(postLikes.userId, input.userId)));
      return 'REMOVED';
    });
  }

  async listComments(postId: number): Promise<PostCommentResult[]> {
    const rows = await this.db
      .select({
        id: postComments.id,
        postId: postComments.postId,
        authorId: postComments.authorId,
        authorNickname: users.nickname,
        authorJob: jobs.name,
        authorProfileImageKey: users.profileImageKey,
        contents: postComments.contents,
        createdAt: postComments.createdAt,
        updatedAt: postComments.updatedAt,
      })
      .from(postComments)
      .innerJoin(users, eq(postComments.authorId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(eq(postComments.postId, postId));
    return rows.map(toPostCommentResult);
  }

  async createComment(input: Readonly<{ postId: number; authorId: number; contents: string }>) {
    return this.db.transaction(async (tx) => {
      const [post] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, input.postId));
      if (post === undefined) {
        this.logger.warn({
          event: 'post_not_found_after_lock',
          operation: 'create_comment',
        });
        throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
      }
      const [author] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.authorId));
      if (author === undefined) {
        this.logger.warn({
          event: 'user_not_found_after_lock',
          operation: 'create_comment',
        });
        throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
      }
      const [created] = await tx
        .insert(postComments)
        .values(input)
        .returning({ id: postComments.id });
      if (created === undefined)
        throw new PostPersistenceException('comment insert did not return a row');

      const [comment] = await tx
        .select({
          id: postComments.id,
          postId: postComments.postId,
          authorId: postComments.authorId,
          authorNickname: users.nickname,
          authorJob: jobs.name,
          authorProfileImageKey: users.profileImageKey,
          contents: postComments.contents,
          createdAt: postComments.createdAt,
          updatedAt: postComments.updatedAt,
        })
        .from(postComments)
        .innerJoin(users, eq(postComments.authorId, users.id))
        .leftJoin(jobs, eq(users.jobId, jobs.id))
        .where(and(eq(postComments.postId, input.postId), eq(postComments.id, created.id)));
      if (comment === undefined)
        throw new PostPersistenceException('created comment was not found');
      return toPostCommentResult(comment);
    });
  }

  async findComment(postId: number, commentId: number): Promise<PostCommentResult | null> {
    const [comment] = await this.db
      .select({
        id: postComments.id,
        postId: postComments.postId,
        authorId: postComments.authorId,
        authorNickname: users.nickname,
        authorJob: jobs.name,
        authorProfileImageKey: users.profileImageKey,
        contents: postComments.contents,
        createdAt: postComments.createdAt,
        updatedAt: postComments.updatedAt,
      })
      .from(postComments)
      .innerJoin(users, eq(postComments.authorId, users.id))
      .leftJoin(jobs, eq(users.jobId, jobs.id))
      .where(and(eq(postComments.postId, postId), eq(postComments.id, commentId)));
    return comment === undefined ? null : toPostCommentResult(comment);
  }

  async updateComment(
    input: Readonly<{
      postId: number;
      commentId: number;
      authorId: number;
      contents: string;
      now: Date;
    }>,
  ): Promise<PostCommentResult | null> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(postComments)
        .set({ contents: input.contents, updatedAt: input.now })
        .where(
          and(
            eq(postComments.postId, input.postId),
            eq(postComments.id, input.commentId),
            eq(postComments.authorId, input.authorId),
          ),
        )
        .returning({ id: postComments.id });
      if (updated === undefined) return null;
      const [comment] = await tx
        .select({
          id: postComments.id,
          postId: postComments.postId,
          authorId: postComments.authorId,
          authorNickname: users.nickname,
          authorJob: jobs.name,
          authorProfileImageKey: users.profileImageKey,
          contents: postComments.contents,
          createdAt: postComments.createdAt,
          updatedAt: postComments.updatedAt,
        })
        .from(postComments)
        .innerJoin(users, eq(postComments.authorId, users.id))
        .leftJoin(jobs, eq(users.jobId, jobs.id))
        .where(and(eq(postComments.postId, input.postId), eq(postComments.id, updated.id)));
      return comment === undefined ? null : toPostCommentResult(comment);
    });
  }

  async deleteComment(input: Readonly<{ postId: number; commentId: number; authorId: number }>) {
    return this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(postComments)
        .where(
          and(
            eq(postComments.postId, input.postId),
            eq(postComments.id, input.commentId),
            eq(postComments.authorId, input.authorId),
          ),
        )
        .returning({ id: postComments.id });
      return deleted.length === 1;
    });
  }
}

function toPostDetailResult(row: PostDetailRow): PostDetailResult {
  return { ...row };
}

function toPostImageResult(row: PostImageRow): PostImageResult {
  return { ...row };
}

function toPostCommentResult(row: PostCommentRow): PostCommentResult {
  return { ...row };
}

function postDetailProjection() {
  return {
    id: posts.id,
    authorId: posts.authorId,
    jogakId: jogakExecutions.jogakId,
    mogakId: mogaks.id,
    scheduledDate: jogakExecutions.scheduledDate,
    contents: posts.contents,
    likeCount: sql<number>`(select count(*)::integer from ${postLikes} where ${postLikes.postId} = ${posts.id})`,
    commentCount: sql<number>`(select count(*)::integer from ${postComments} where ${postComments.postId} = ${posts.id})`,
  };
}
