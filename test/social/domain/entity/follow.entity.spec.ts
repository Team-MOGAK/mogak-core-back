import { isSelfFollow } from '@core/social/domain/policy/follow.policy';

describe('팔로우 도메인', () => {
  it('팔로워와 팔로잉 사용자가 같으면 자기 자신 팔로우로 식별한다', () => {
    expect(isSelfFollow(7, 7)).toBe(true);
  });
});
