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

export type ContentsValidationResult =
  | Readonly<{ valid: true; value: string }>
  | Readonly<{ valid: false; reason: 'EMPTY' | 'TOO_LONG' }>;

export function validatePostContents(contents: string): ContentsValidationResult {
  return validateContents(contents, 350);
}

export function validateCommentContents(contents: string): ContentsValidationResult {
  return validateContents(contents, 200);
}

export function isCommentAuthor(comment: Pick<PostComment, 'authorId'>, userId: number): boolean {
  return comment.authorId === userId;
}

function validateContents(contents: string, maxLength: number): ContentsValidationResult {
  const trimmed = contents?.trim();
  if (trimmed === undefined || trimmed.length === 0) return { valid: false, reason: 'EMPTY' };
  if (trimmed.length > maxLength) return { valid: false, reason: 'TOO_LONG' };
  return { valid: true, value: trimmed };
}
