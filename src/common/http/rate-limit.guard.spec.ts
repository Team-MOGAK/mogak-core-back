import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

import { AppErrorCode } from './app-error-code';
import { AppException } from './app.exception';
import { RateLimitGuard } from './rate-limit.guard';

const policy = { limit: 20, windowMs: 60_000 };
const handler = Object.defineProperty(() => undefined, 'name', { value: 'loginApple' });
const context = {
  getHandler: () => handler,
  getClass: () => class AuthController {},
  switchToHttp: () => ({
    getRequest: () => ({
      ip: '203.0.113.10',
      headers: { authorization: 'Bearer secret', refreshtoken: 'refresh-secret' },
      body: { id_token: 'social-secret' },
    }),
  }),
};

describe('RateLimitGuard 거절 로그', () => {
  afterEach(() => jest.restoreAllMocks());

  it('거절한 요청의 handler와 정책만 warn 로그로 남긴다', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new RateLimitGuard(
      { getAllAndOverride: () => policy } as never,
      { consume: () => false } as never,
    );

    expect(() => guard.canActivate(context as never)).toThrow(
      new AppException(AppErrorCode.TOO_MANY_REQUESTS),
    );
    expect(warn).toHaveBeenCalledWith({
      event: 'rate_limit_rejected',
      handler: 'loginApple',
      limit: 20,
      windowMs: 60_000,
    });
  });

  it('허용한 요청에는 warn 로그를 남기지 않는다', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new RateLimitGuard(
      { getAllAndOverride: () => policy } as never,
      { consume: () => true } as never,
    );

    expect(guard.canActivate(context as never)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
