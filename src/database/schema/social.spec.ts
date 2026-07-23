import { getTableConfig } from 'drizzle-orm/pg-core';

import * as schema from './index';

type Column = Readonly<{ dataType: string; notNull: boolean }>;
type SocialSchema = Readonly<{
  follows: Readonly<{ id: Column; followerId: Column; followingId: Column }>;
}>;

const socialSchema = schema as Partial<SocialSchema>;

describe('소셜 데이터베이스 스키마', () => {
  it('팔로우에 bigint 사용자 소유 식별자를 사용한다', () => {
    expect(socialSchema.follows).toBeDefined();
    if (socialSchema.follows === undefined) return;

    expect(socialSchema.follows.id.dataType).toBe('number');
    expect(socialSchema.follows.followerId.notNull).toBe(true);
    expect(socialSchema.follows.followingId.notNull).toBe(true);
  });

  it('방향성 팔로우에 필요한 자연 고유성 규칙만 추가한다', () => {
    expect(socialSchema.follows).toBeDefined();
    if (socialSchema.follows === undefined) return;

    const names = getTableConfig(
      socialSchema.follows as unknown as Parameters<typeof getTableConfig>[0],
    )
      .uniqueConstraints.map((constraint) => constraint.getName())
      .filter((name): name is string => name !== undefined);

    expect(names).toEqual(['follows_follower_following_unique']);
  });
});
