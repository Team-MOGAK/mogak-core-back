import type { ThrottlerStorage } from '@nestjs/throttler';

export const MAX_THROTTLER_ENTRIES = 10_000;

type BoundedThrottlerStorageOptions = Readonly<{
  maxEntries?: number;
}>;

type ThrottlerBucket = {
  totalHits: number;
  windowExpiresAt: number;
  blockExpiresAt: number;
  expiresAt: number;
  timeout?: NodeJS.Timeout;
};

type ThrottlerStorageResult = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

/**
 * An instance-local store for Nest's standard ThrottlerGuard.
 *
 * Every generated throttler key owns exactly one timeout. Expiring or evicting
 * that key clears only its own timeout, so one IP cannot affect another IP's
 * fixed window or block duration.
 */
export class BoundedThrottlerStorage implements ThrottlerStorage {
  private readonly buckets = new Map<string, ThrottlerBucket>();

  private readonly maxEntries: number;

  constructor(options: BoundedThrottlerStorageOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_THROTTLER_ENTRIES;
  }

  get entryCount(): number {
    return this.buckets.size;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageResult> {
    void throttlerName;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (bucket && this.isExpired(bucket, now)) {
      this.remove(key);
      bucket = undefined;
    }

    if (bucket?.blockExpiresAt && bucket.blockExpiresAt <= now) {
      this.remove(key);
      bucket = undefined;
    }

    if (!bucket) {
      bucket = this.createBucket(key, ttl, now);
    } else {
      this.touch(key, bucket);
    }

    if (bucket.blockExpiresAt > now) {
      return this.toRecord(bucket, now, true);
    }

    bucket.totalHits += 1;

    if (bucket.totalHits > limit) {
      bucket.blockExpiresAt = now + blockDuration;
      bucket.expiresAt = Math.max(bucket.windowExpiresAt, bucket.blockExpiresAt);
      this.scheduleExpiration(key, bucket);
      return this.toRecord(bucket, now, true);
    }

    return this.toRecord(bucket, now, false);
  }

  private createBucket(key: string, ttl: number, now: number): ThrottlerBucket {
    this.makeSpace(now);

    const expiresAt = now + ttl;
    const bucket: ThrottlerBucket = {
      totalHits: 0,
      windowExpiresAt: expiresAt,
      blockExpiresAt: 0,
      expiresAt,
    };

    this.buckets.set(key, bucket);
    this.scheduleExpiration(key, bucket);
    return bucket;
  }

  private makeSpace(now: number): void {
    if (this.buckets.size < this.maxEntries) {
      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (this.isExpired(bucket, now)) {
        this.remove(key);
      }
    }

    while (this.buckets.size >= this.maxEntries) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.remove(oldestKey);
    }
  }

  private touch(key: string, bucket: ThrottlerBucket): void {
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
  }

  private scheduleExpiration(key: string, bucket: ThrottlerBucket): void {
    if (bucket.timeout) {
      clearTimeout(bucket.timeout);
    }

    const delay = Math.max(0, bucket.expiresAt - Date.now());
    bucket.timeout = setTimeout(() => {
      if (this.buckets.get(key) === bucket && this.isExpired(bucket, Date.now())) {
        this.remove(key);
      }
    }, delay);
    bucket.timeout.unref();
  }

  private isExpired(bucket: ThrottlerBucket, now: number): boolean {
    return bucket.expiresAt <= now;
  }

  private remove(key: string): void {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return;
    }

    if (bucket.timeout) {
      clearTimeout(bucket.timeout);
    }
    this.buckets.delete(key);
  }

  private toRecord(
    bucket: ThrottlerBucket,
    now: number,
    isBlocked: boolean,
  ): ThrottlerStorageResult {
    return {
      totalHits: bucket.totalHits,
      timeToExpire: this.secondsUntil(bucket.windowExpiresAt, now),
      isBlocked,
      timeToBlockExpire: isBlocked ? this.secondsUntil(bucket.blockExpiresAt, now) : 0,
    };
  }

  private secondsUntil(expiresAt: number, now: number): number {
    return Math.max(0, Math.ceil((expiresAt - now) / 1_000));
  }
}
