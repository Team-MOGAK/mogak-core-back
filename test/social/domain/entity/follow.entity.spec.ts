import { isSelfFollow, type Follow } from '../../../../src/social/domain/entity/follow.entity';

describe('팔로우 도메인', () => {
  it('팔로워와 팔로잉 사용자가 같으면 자기 자신 팔로우로 식별한다', () => {
    const follow: Follow = {
      id: 1,
      followerId: 7,
      followingId: 7,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    };

    expect(isSelfFollow(follow)).toBe(true);
  });
});
