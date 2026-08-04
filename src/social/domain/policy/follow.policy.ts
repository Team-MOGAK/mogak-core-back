export function isSelfFollow(followerId: number, followingId: number): boolean {
  return followerId === followingId;
}
