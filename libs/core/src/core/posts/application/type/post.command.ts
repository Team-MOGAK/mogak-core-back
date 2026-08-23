export type CreatePostCommand = Readonly<{
  authorId: number;
  jogakId: number;
  scheduledDate: string;
  contents: string;
}>;

export type UpdatePostCommand = Readonly<{
  postId: number;
  authorId: number;
  contents: string;
  now: Date;
}>;

export type CreateCommentCommand = Readonly<{ postId: number; authorId: number; contents: string }>;
export type UpdateCommentCommand = Readonly<{
  postId: number;
  commentId: number;
  authorId: number;
  contents: string;
  now: Date;
}>;
