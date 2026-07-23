import { SetMetadata } from '@nestjs/common';

import type { RateLimitPolicy } from './fixed-window-rate-limiter';

export const RATE_LIMIT_POLICY = Symbol('rate-limit-policy');

export function RateLimit(policy: RateLimitPolicy) {
  return SetMetadata(RATE_LIMIT_POLICY, policy);
}
