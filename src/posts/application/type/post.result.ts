export type ToggleLikeResult = 'CREATED' | 'REMOVED';

export type PostDetailResult = Readonly<{
  id: number;
  authorId: number;
  jogakId: number | null;
  mogakId: number | null;
  scheduledDate: string | null;
  contents: string;
  likeCount: number;
  commentCount: number;
}>;

export type PostImageResult = Readonly<{ postId: number; storageKey: string; position: number }>;
export type PostCommentResult = Readonly<{
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
