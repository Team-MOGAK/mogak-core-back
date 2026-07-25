import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import {
  OWNED_MOGAK_PORT,
  type OwnedMogakPort,
} from '../../mogaks/application/port/owned-mogak.port';
import {
  OWNED_OCCURRENCE_PORT,
  type OwnedOccurrencePort,
} from '../../mogaks/application/port/owned-occurrence.port';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';
import { PostsRepository, type PostCommentRecord } from '../infrastructure/posts.repository';

const MAX_POST_CONTENTS_LENGTH = 350;

export type CreatePostInput = Readonly<{
  jogakId: number;
  targetDate: string;
  contents: string;
}>;

@Injectable()
export class PostsService {
  constructor(
    @Inject(PostsRepository) private readonly repository: PostsRepository,
    @Inject(OWNED_OCCURRENCE_PORT) private readonly jogaks: OwnedOccurrencePort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(OWNED_MOGAK_PORT) private readonly mogaks: OwnedMogakPort,
  ) {}

  async createPost(userId: number, input: CreatePostInput) {
    const contents = validatePostContents(input.contents);
    const occurrence = await this.jogaks.resolveOwnedOccurrence(
      userId,
      input.jogakId,
      input.targetDate,
    );
    const result = await this.repository.createForOccurrence({
      authorId: userId,
      jogakId: occurrence.jogakId,
      scheduledDate: input.targetDate,
      jogakTitleSnapshot: occurrence.title,
      contents,
    });
    if (result.type === 'DUPLICATE') throw new DomainException(AppErrorCode.POST_ALREADY_EXISTS);

    return {
      id: result.post.id,
      mogakId: occurrence.mogakId,
      jogakId: result.post.jogakId,
      targetDate: result.post.scheduledDate,
      userId: result.post.authorId,
      contents: result.post.contents,
      imgUrls: [],
      createdAt: result.post.createdAt,
    };
  }

  async toggleLike(userId: number, postId: number): Promise<string> {
    if ((await this.repository.findPost(postId)) === null) {
      throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    }
    const result = await this.repository.toggleLike({ postId, userId });
    return result === 'CREATED' ? '좋아요가 생성되었습니다' : '좋아요가 삭제되었습니다';
  }

  async updatePost(userId: number, postId: number, contents: string) {
    const updated = await this.repository.updateOwnedPost({
      postId,
      authorId: userId,
      contents: validatePostContents(contents),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    return { postId: updated.id, contents: updated.contents, updatedAt: updated.updatedAt };
  }

  async deletePost(userId: number, postId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedPost({ postId, authorId: userId }))) {
      throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    }
  }

  async getPostByJogakAndDate(userId: number, jogakId: number, targetDate: string) {
    await this.jogaks.resolveOwnedOccurrence(userId, jogakId, targetDate);
    const post = await this.repository.findOwnedPostByOccurrence(userId, jogakId, targetDate);
    if (post === null) throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    return this.toPostDetail(post);
  }

  async getPost(userId: number, postId: number) {
    const post = await this.repository.findOwnedPost(userId, postId);
    if (post === null) throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    return this.toPostDetail(post);
  }

  async listMogakPosts(userId: number, mogakId: number, page: number, size: number) {
    await this.mogaks.resolveOwnedMogak(userId, mogakId);
    const posts = await this.repository.listOwnedMogakPosts({
      userId,
      mogakId,
      limit: size + 1,
      offset: page * size,
    });
    const visiblePosts = posts.slice(0, size);
    const images = await this.repository.listImagesForPosts(visiblePosts.map((post) => post.id));
    const firstImageByPostId = new Map<number, string>();
    for (const image of images) {
      if (!firstImageByPostId.has(image.postId)) {
        firstImageByPostId.set(image.postId, image.storageKey);
      }
    }

    const content = await Promise.all(
      visiblePosts.map(async (post) => ({
        postId: post.id,
        mogakId: post.mogakId,
        jogakId: post.jogakId,
        targetDate: post.scheduledDate,
        contents: post.contents,
        thumbnailUrl: await this.resolveThumbnail(firstImageByPostId.get(post.id) ?? null),
        likeCnt: post.likeCount,
      })),
    );
    return {
      content,
      size,
      number: page,
      numberOfElements: content.length,
      first: page === 0,
      last: posts.length <= size,
      empty: content.length === 0,
    };
  }

  async listComments(postId: number) {
    if ((await this.repository.findPost(postId)) === null) {
      throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    }
    return {
      comments: await Promise.all(
        (await this.repository.listComments(postId)).map((comment) =>
          toCommentListItem(this.storage, comment),
        ),
      ),
    };
  }

  async createComment(userId: number, postId: number, contents: string) {
    if ((await this.repository.findPost(postId)) === null) {
      throw new DomainException(AppErrorCode.POST_NOT_FOUND);
    }
    const comment = await this.repository.createComment({
      postId,
      authorId: userId,
      contents: validateCommentContents(contents),
    });
    return {
      id: comment.id,
      postId: comment.postId,
      userId: comment.authorId,
      contents: comment.contents,
      createdAt: comment.createdAt,
      author: await toCommentAuthor(this.storage, comment),
    };
  }

  async updateComment(userId: number, postId: number, commentId: number, contents: string) {
    const comment = await this.requireOwnedComment(userId, postId, commentId);
    const updated = await this.repository.updateComment({
      postId,
      commentId: comment.id,
      authorId: userId,
      contents: validateCommentContents(contents),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(AppErrorCode.COMMENT_NOT_FOUND);
    return {
      id: updated.id,
      contents: updated.contents,
      updatedAt: updated.updatedAt,
      author: await toCommentAuthor(this.storage, updated),
    };
  }

  async deleteComment(userId: number, postId: number, commentId: number): Promise<void> {
    await this.requireOwnedComment(userId, postId, commentId);
    if (!(await this.repository.deleteComment({ postId, commentId, authorId: userId }))) {
      throw new DomainException(AppErrorCode.COMMENT_NOT_FOUND);
    }
  }

  private async requireOwnedComment(userId: number, postId: number, commentId: number) {
    const comment = await this.repository.findComment(postId, commentId);
    if (comment === null) throw new DomainException(AppErrorCode.COMMENT_NOT_FOUND);
    if (comment.authorId !== userId) throw new DomainException(AppErrorCode.FORBIDDEN);
    return comment;
  }

  private async toPostDetail(
    post: Awaited<ReturnType<PostsRepository['findOwnedPostByOccurrence']>>,
  ) {
    if (post === null) throw new Error('post projection was unexpectedly missing');
    const [images, commentIds] = await Promise.all([
      this.repository.listImagesForPosts([post.id]),
      this.repository.listCommentIds(post.id),
    ]);
    const imgUrls = (
      await Promise.all(images.map((image) => this.storage.resolvePublicUrl(image.storageKey)))
    ).filter((url): url is string => url !== null);
    return {
      postId: post.id,
      mogakId: post.mogakId,
      jogakId: post.jogakId,
      targetDate: post.scheduledDate,
      userId: post.authorId,
      contents: post.contents,
      imgUrls,
      commentId: commentIds,
      likeCnt: post.likeCount,
      commentCnt: post.commentCount,
    };
  }

  private async resolveThumbnail(storageKey: string | null): Promise<string | null> {
    return storageKey === null ? null : this.storage.resolvePublicUrl(storageKey);
  }
}

function validatePostContents(contents: string): string {
  const trimmed = contents?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
  if (trimmed.length > MAX_POST_CONTENTS_LENGTH) {
    throw new DomainException(AppErrorCode.POST_CONTENTS_TOO_LONG);
  }
  return trimmed;
}

function validateCommentContents(contents: string): string {
  const trimmed = contents?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
  if (trimmed.length > 200) {
    throw new DomainException(AppErrorCode.COMMENT_CONTENTS_TOO_LONG);
  }
  return trimmed;
}

async function toCommentListItem(storage: StoragePort, comment: PostCommentRecord) {
  return {
    commentId: comment.id,
    postId: comment.postId,
    contents: comment.contents,
    createdAt: comment.createdAt,
    author: await toCommentAuthor(storage, comment),
  };
}

async function toCommentAuthor(storage: StoragePort, comment: PostCommentRecord) {
  return {
    userId: comment.authorId,
    nickname: comment.authorNickname,
    profileImageUrl:
      comment.authorProfileImageKey === null
        ? null
        : await storage.resolvePublicUrl(comment.authorProfileImageKey),
    job: comment.authorJob,
  };
}
