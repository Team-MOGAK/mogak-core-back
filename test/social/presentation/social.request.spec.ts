import {
  networkPostsQuerySchema,
  pacemakerPostsQuerySchema,
} from '@api/social/presentation/type/social.request';

describe('소셜 목록 요청 스키마', () => {
  it('size 상한과 page/cursor offset overflow를 거부한다', () => {
    expect(networkPostsQuerySchema.safeParse({ size: 100 }).success).toBe(true);
    expect(networkPostsQuerySchema.safeParse({ size: 101 }).success).toBe(false);
    expect(
      networkPostsQuerySchema.safeParse({ page: Number.MAX_SAFE_INTEGER, size: 100 }).success,
    ).toBe(false);
    expect(
      pacemakerPostsQuerySchema.safeParse({ cursor: Number.MAX_SAFE_INTEGER, size: 100 }).success,
    ).toBe(false);
  });
});
