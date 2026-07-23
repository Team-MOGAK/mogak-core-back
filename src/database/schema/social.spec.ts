import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from './index';

type Column = Readonly<{ dataType: string; notNull: boolean }>;
type SocialSchema = Readonly<{
  follows: Readonly<{ id: Column; followerId: Column; followingId: Column }>;
}>;

const socialSchema = schema as Partial<SocialSchema>;

describe('social schema', () => {
  it('uses bigint user ownership columns for follows', () => {
    expect(socialSchema.follows).toBeDefined();
    if (socialSchema.follows === undefined) return;

    expect(socialSchema.follows.id.dataType).toBe('number');
    expect(socialSchema.follows.followerId.notNull).toBe(true);
    expect(socialSchema.follows.followingId.notNull).toBe(true);
  });

  it('adds only the natural directional follow uniqueness rule', () => {
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
