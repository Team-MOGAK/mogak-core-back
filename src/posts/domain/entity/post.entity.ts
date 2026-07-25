import { AppErrorCode } from '../../../common/http/app-error-code';
import { DomainException } from '../../../common/http/domain.exception';

/** A row from the `posts` table. */
export type Post = Readonly<{
  id: number;
  jogakExecutionId: number;
  authorId: number;
  contents: string;
  createdAt: Date;
  updatedAt: Date;
}>;

/** A row from the `post_images` table. */
export type PostImage = Readonly<{
  id: number;
  postId: number;
  storageKey: string;
  position: number;
  createdAt: Date;
}>;

/** A row from the `post_comments` table. */
export type PostComment = Readonly<{
  id: number;
  postId: number;
  authorId: number;
  contents: string;
  createdAt: Date;
  updatedAt: Date;
}>;

/** A row from the `post_likes` table. */
export type PostLike = Readonly<{ id: number; postId: number; userId: number; createdAt: Date }>;

export function normalizePostContents(contents: string): string {
  return normalizeContents(contents, 350, AppErrorCode.POST_CONTENTS_TOO_LONG);
}

export function normalizeCommentContents(contents: string): string {
  return normalizeContents(contents, 200, AppErrorCode.COMMENT_CONTENTS_TOO_LONG);
}

export function isCommentAuthor(comment: Pick<PostComment, 'authorId'>, userId: number): boolean {
  return comment.authorId === userId;
}

function normalizeContents(contents: string, maxLength: number, tooLongCode: AppErrorCode): string {
  const trimmed = contents?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
  if (trimmed.length > maxLength) throw new DomainException(tooLongCode);
  return trimmed;
}
