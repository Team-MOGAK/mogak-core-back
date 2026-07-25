/** Shapes selected from Drizzle joins and aggregates; never cross the application port. */
export type FeedPostProjection = Readonly<{
  id: number;
  authorId: number;
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
  contents: string;
  likeCount: number;
  commentCount: number;
}>;

export type FeedImageProjection = Readonly<{ postId: number; storageKey: string }>;

export type FeedCommentProjection = Readonly<{
  id: number;
  postId: number;
  authorId: number;
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
  contents: string;
  createdAt: Date;
}>;
