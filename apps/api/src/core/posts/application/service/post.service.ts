import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { OwnedMogakPort } from '@core/mogaks/application/port/ownedMogak.port';
import type { OwnedOccurrencePort } from '@core/mogaks/application/port/ownedOccurrence.port';
import type { StoragePort } from '@core/storage/application/storage.port';
import { isCommentAuthor } from '../../domain/policy/postComment.policy';
import {
  validateCommentContents,
  validatePostContents,
  type ContentsValidationResult,
} from '../../domain/policy/postContents.policy';
import type { PostRepositoryPort } from '../port/post.repository.port';
import type { PostCommentResult, PostDetailResult } from '../type/post.result';

export type CreatePostInput = Readonly<{ jogakId: number; targetDate: string; contents: string }>;

export class PostService {
  constructor(
    private readonly repository: PostRepositoryPort,
    private readonly jogaks: OwnedOccurrencePort,
    private readonly storage: StoragePort,
    private readonly mogaks: OwnedMogakPort,
  ) {}

  async createPost(userId: number, input: CreatePostInput) {
    const contents = requirePostContents(input.contents);
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
    if (result.type === 'DUPLICATE') throw new DomainException(DomainErrorCode.POST_ALREADY_EXISTS);
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
    if ((await this.repository.findPost(postId)) === null)
      throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
    return (await this.repository.toggleLike({ postId, userId })) === 'CREATED'
      ? '좋아요가 생성되었습니다'
      : '좋아요가 삭제되었습니다';
  }

  async updatePost(userId: number, postId: number, contents: string) {
    const updated = await this.repository.updateOwnedPost({
      postId,
      authorId: userId,
      contents: requirePostContents(contents),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
    return { postId: updated.id, contents: updated.contents, updatedAt: updated.updatedAt };
  }

  async deletePost(userId: number, postId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedPost({ postId, authorId: userId }))) {
      throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
    }
  }

  async getPostByJogakAndDate(userId: number, jogakId: number, targetDate: string) {
    await this.jogaks.resolveOwnedOccurrence(userId, jogakId, targetDate);
    const post = await this.repository.findOwnedPostByOccurrence(userId, jogakId, targetDate);
    if (post === null) throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
    return this.toPostDetail(post);
  }

  async getPost(userId: number, postId: number) {
    const post = await this.repository.findOwnedPost(userId, postId);
    if (post === null) throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
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
    for (const image of images)
      if (!firstImageByPostId.has(image.postId))
        firstImageByPostId.set(image.postId, image.storageKey);
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
    if ((await this.repository.findPost(postId)) === null)
      throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
    return {
      comments: await Promise.all(
        (await this.repository.listComments(postId)).map((comment) =>
          toCommentListItem(this.storage, comment),
        ),
      ),
    };
  }

  async createComment(userId: number, postId: number, contents: string) {
    if ((await this.repository.findPost(postId)) === null)
      throw new DomainException(DomainErrorCode.POST_NOT_FOUND);
    const comment = await this.repository.createComment({
      postId,
      authorId: userId,
      contents: requireCommentContents(contents),
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
      contents: requireCommentContents(contents),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(DomainErrorCode.COMMENT_NOT_FOUND);
    return {
      id: updated.id,
      contents: updated.contents,
      updatedAt: updated.updatedAt,
      author: await toCommentAuthor(this.storage, updated),
    };
  }

  async deleteComment(userId: number, postId: number, commentId: number): Promise<void> {
    await this.requireOwnedComment(userId, postId, commentId);
    if (!(await this.repository.deleteComment({ postId, commentId, authorId: userId })))
      throw new DomainException(DomainErrorCode.COMMENT_NOT_FOUND);
  }

  private async requireOwnedComment(userId: number, postId: number, commentId: number) {
    const comment = await this.repository.findComment(postId, commentId);
    if (comment === null) throw new DomainException(DomainErrorCode.COMMENT_NOT_FOUND);
    if (!isCommentAuthor(comment.authorId, userId)) {
      throw new DomainException(DomainErrorCode.FORBIDDEN);
    }
    return comment;
  }

  private async toPostDetail(post: PostDetailResult) {
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

function requirePostContents(contents: string): string {
  return requireContents(validatePostContents(contents), 'POST_CONTENTS_TOO_LONG');
}

function requireCommentContents(contents: string): string {
  return requireContents(validateCommentContents(contents), 'COMMENT_CONTENTS_TOO_LONG');
}

function requireContents(result: ContentsValidationResult, tooLongCode: DomainErrorCode): string {
  if (result.valid) return result.value;
  throw new DomainException(result.reason === 'EMPTY' ? 'INVALID_PARAMETER' : tooLongCode);
}

async function toCommentListItem(storage: StoragePort, comment: PostCommentResult) {
  return {
    commentId: comment.id,
    postId: comment.postId,
    contents: comment.contents,
    createdAt: comment.createdAt,
    author: await toCommentAuthor(storage, comment),
  };
}

async function toCommentAuthor(storage: StoragePort, comment: PostCommentResult) {
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
