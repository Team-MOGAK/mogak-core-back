export type FollowCountsResponse = Readonly<{ mentorCnt: number; motoCnt: number }>;

export type FollowUserResponse = Readonly<{ nickname: string | null; job: string | null }>;

export type FeedAuthorResponse = Readonly<{
  userId: number;
  nickname: string | null;
  job: string | null;
  profileImageUrl: string | null;
}>;

export type FeedCommentResponse = Readonly<{
  commentId: number;
  contents: string;
  createdAt: Date;
  author: FeedAuthorResponse;
}>;

export type PacemakerPostResponse = Readonly<{
  author: FeedAuthorResponse;
  contents: string;
  imgUrls: string[];
  likeCnt: number;
  comments: FeedCommentResponse[];
}>;

export type NetworkPostResponse = Readonly<{
  postId: number;
  author: FeedAuthorResponse;
  contents: string;
  imgUrls: string[];
  likeCnt: number;
  commentCnt: number;
}>;

export type NetworkPostsResponse = Readonly<{
  content: NetworkPostResponse[];
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}>;
