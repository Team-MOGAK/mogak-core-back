export type SocialUserResult = Readonly<{ id: number }>;

export type SocialUserSummaryResult = Readonly<{ nickname: string | null; job: string | null }>;

export type FeedPostResult = Readonly<{
  id: number;
  authorId: number;
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
  contents: string;
  likeCount: number;
  commentCount: number;
}>;

export type FeedImageResult = Readonly<{ postId: number; storageKey: string }>;

export type FeedCommentResult = Readonly<{
  id: number;
  postId: number;
  authorId: number;
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
  contents: string;
  createdAt: Date;
}>;

export type FeedAuthorResult = Readonly<{
  userId: number;
  nickname: string | null;
  job: string | null;
  profileImageUrl: string | null;
}>;

export type FeedCommentItemResult = Readonly<{
  commentId: number;
  contents: string;
  createdAt: Date;
  author: FeedAuthorResult;
}>;

export type PacemakerPostResult = Readonly<{
  author: FeedAuthorResult;
  contents: string;
  imgUrls: string[];
  likeCnt: number;
  comments: FeedCommentItemResult[];
}>;

export type NetworkPostResult = Readonly<{
  postId: number;
  author: FeedAuthorResult;
  contents: string;
  imgUrls: string[];
  likeCnt: number;
  commentCnt: number;
}>;

export type NetworkPostsResult = Readonly<{
  content: NetworkPostResult[];
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}>;
