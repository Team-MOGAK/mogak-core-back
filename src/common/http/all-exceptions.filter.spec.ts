import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ThrottlerException } from '@nestjs/throttler';

import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter의 rate limit 처리', () => {
  afterEach(() => jest.restoreAllMocks());

  it('ThrottlerException은 기본 429 응답과 안전한 거절 로그로 처리한다', () => {
    const exception = new ThrottlerException();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          baseUrl: '/api/auth',
          route: { path: '/login' },
          ip: '203.0.113.10',
          headers: { authorization: 'Bearer access-secret' },
          body: { id_token: 'social-secret' },
          query: { token: 'query-secret' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new AllExceptionsFilter().catch(exception, host as never);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'ThrottlerException: Too Many Requests',
    });
    expect(warn).toHaveBeenCalledWith({
      event: 'rate_limit_rejected',
      method: 'POST',
      route: '/api/auth/login',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('203.0.113.10');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('access-secret');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('social-secret');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('query-secret');
  });
});
