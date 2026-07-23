import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppErrorCode } from './app-error-code';
import { AppException } from './app.exception';
import { FixedWindowRateLimiter, type RateLimitPolicy } from './fixed-window-rate-limiter';
import { RATE_LIMIT_POLICY } from './rate-limit.decorator';

type RateLimitedRequest = {
  ip?: string;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
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
    const key = `${context.getHandler().name}:${request.ip ?? 'unknown'}`;
    if (!this.limiter.consume(key, policy)) {
      throw new AppException(AppErrorCode.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
