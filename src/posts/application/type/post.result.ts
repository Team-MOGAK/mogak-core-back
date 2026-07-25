export type ToggleLikeResult = 'CREATED' | 'REMOVED';

export type PostDetailProjection = Readonly<{
  id: number;
  authorId: number;
  jogakId: number;
  mogakId: number;
  scheduledDate: string;
  contents: string;
  likeCount: number;
  commentCount: number;
}>;

export type PostImageProjection = Readonly<{ postId: number; storageKey: string; position: number }>;
export type PostCommentProjection = Readonly<{
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
