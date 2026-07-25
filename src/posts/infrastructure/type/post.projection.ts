/** Shapes selected from Drizzle joins and aggregates; never cross the application port. */
export type CreatedPostRow = Readonly<{
  id: number;
  jogakExecutionId: number;
  authorId: number;
  jogakId: number;
  scheduledDate: string;
  contents: string;
  createdAt: Date;
}>;

export type PostDetailRow = Readonly<{
  id: number;
  authorId: number;
  jogakId: number;
  mogakId: number;
  scheduledDate: string;
  contents: string;
  likeCount: number;
  commentCount: number;
}>;

export type PostImageRow = Readonly<{ postId: number; storageKey: string; position: number }>;

export type PostCommentRow = Readonly<{
  id: number;
  postId: number;
  authorId: number;
  authorNickname: string | null;
  authorJob: string | null;
  authorProfileImageKey: string | null;
  contents: string;
  createdAt: Date;
  updatedAt: Date;
}>;
