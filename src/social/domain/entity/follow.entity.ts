/** A row from the `follows` table. */
export type Follow = Readonly<{
  id: number;
  followerId: number;
  followingId: number;
  createdAt: Date;
}>;

export function isSelfFollow(follow: Pick<Follow, 'followerId' | 'followingId'>): boolean {
  return follow.followerId === follow.followingId;
}
