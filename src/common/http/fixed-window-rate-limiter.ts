export type RateLimitPolicy = Readonly<{
  limit: number;
  windowMs: number;
}>;

type RateLimitBucket = {
  count: number;
  expiresAt: number;
};

export const MAX_RATE_LIMIT_BUCKETS = 10_000;

@Injectable()
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  get bucketCount(): number {
    return this.buckets.size;
  }

  consume(key: string, policy: RateLimitPolicy, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (bucket !== undefined && bucket.expiresAt > now) {
      if (bucket.count >= policy.limit) {
        return false;
      }
      bucket.count += 1;
      return true;
    }

    if (this.buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      this.removeExpired(now);
      if (this.buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey !== undefined) {
          this.buckets.delete(oldestKey);
        }
      }
    }
    this.buckets.set(key, { count: 1, expiresAt: now + policy.windowMs });
    return true;
  }

  private removeExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
import { Injectable } from '@nestjs/common';
