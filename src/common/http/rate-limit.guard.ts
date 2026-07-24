import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector as NestReflector } from '@nestjs/core';
import type { Reflector } from '@nestjs/core';

import { AppErrorCode } from './app-error-code';
import { AppException } from './app.exception';
import { FixedWindowRateLimiter as FixedWindowRateLimiterProvider } from './fixed-window-rate-limiter';
import type { FixedWindowRateLimiter } from './fixed-window-rate-limiter';
import type { RateLimitPolicy } from './fixed-window-rate-limiter';
import { RATE_LIMIT_POLICY } from './rate-limit.decorator';

type RateLimitedRequest = {
  ip?: string;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(NestReflector)
    private readonly reflector: Reflector,
    @Inject(FixedWindowRateLimiterProvider)
    private readonly limiter: FixedWindowRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const handler = context.getHandler().name;
    const key = `${handler}:${request.ip ?? 'unknown'}`;
    if (!this.limiter.consume(key, policy)) {
      this.logger.warn({
        event: 'rate_limit_rejected',
        handler,
        limit: policy.limit,
        windowMs: policy.windowMs,
      });
      throw new AppException(AppErrorCode.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
