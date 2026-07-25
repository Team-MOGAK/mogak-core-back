export type MogakPostsQuery = Readonly<{
  userId: number;
  mogakId: number;
  limit: number;
  offset: number;
}>;
