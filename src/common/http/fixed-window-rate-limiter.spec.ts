import { FixedWindowRateLimiter, MAX_RATE_LIMIT_BUCKETS } from './fixed-window-rate-limiter';

describe('고정 윈도우 요청 제한기', () => {
  it('같은 키는 한도에서 거부하고 윈도우가 지나면 다시 허용한다', () => {
    const limiter = new FixedWindowRateLimiter();
    const policy = { limit: 2, windowMs: 60_000 };

    expect(limiter.consume('ip', policy, 0)).toBe(true);
    expect(limiter.consume('ip', policy, 1)).toBe(true);
    expect(limiter.consume('ip', policy, 2)).toBe(false);
    expect(limiter.consume('ip', policy, 60_000)).toBe(true);
  });

  it('새 키가 과도하게 늘어나도 제한 버킷 수를 상한 안에 유지한다', () => {
    const limiter = new FixedWindowRateLimiter();
    const policy = { limit: 1, windowMs: 60_000 };

    for (let index = 0; index <= MAX_RATE_LIMIT_BUCKETS; index += 1) {
      limiter.consume(`ip-${index}`, policy, 0);
    }

    expect(limiter.bucketCount).toBe(MAX_RATE_LIMIT_BUCKETS);
  });
});
