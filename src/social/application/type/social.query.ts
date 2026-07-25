export type PacemakerPostsQuery = Readonly<{ userId: number; limit: number; offset: number }>;

export type NetworkPostsQuery = Readonly<{
  address: string;
  sort: 'createdAt' | 'likeCnt';
  limit: number;
  offset: number;
}>;
