import { HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ThrottlerException } from '@nestjs/throttler';

import { AppErrorCode } from '../../../src/common/http/appErrorCode';
import { DomainException } from '../../../src/common/domain.exception';
import { GlobalExceptionFilter } from '../../../src/common/http/globalException.filter';

describe('GlobalExceptionFilter의 rate limit 처리', () => {
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

    new GlobalExceptionFilter().catch(exception, host as never);

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

describe('GlobalExceptionFilter의 도메인 예외 처리', () => {
  afterEach(() => jest.restoreAllMocks());

  it('DomainException은 정의된 상태와 오류 코드로 응답한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.USER_NOT_FOUND),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'NOT_FOUND',
        code: 'U001',
        message: '존재하지 않는 사용자입니다',
      }),
    );
  });

  it('DomainException은 기존 오류 정보를 warn 로그에 남긴다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.USER_NOT_FOUND),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith({
      type: 'domain_exception',
      code: 'U001',
      status: 'NOT_FOUND',
      message: '존재하지 않는 사용자입니다',
    });
  });

  it('권한 거부도 같은 도메인 예외 로그 형식을 사용한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(new DomainException(AppErrorCode.FORBIDDEN), host as never);

    expect(warn).toHaveBeenCalledWith({
      type: 'domain_exception',
      code: 'T004',
      status: 'FORBIDDEN',
      message: '권한이 부여되지 않았습니다',
    });
  });

  it('Z005는 원문 요청값을 남기되 인증 필드를 재귀적으로 제거한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          baseUrl: '/api/posts',
          route: { path: '/:postId' },
          params: { postId: 'wrong' },
          query: { page: 'wrong', access_token: 'query-secret' },
          body: {
            title: '비밀 제목',
            nested: { accessToken: 'nested-secret', email: 'person@example.com', categoryCode: 'STUDY' },
            unknown: '원문 값',
          },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.INVALID_PARAMETER),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith({
      type: 'domain_exception',
      code: 'Z005',
      status: 'BAD_REQUEST',
      message: '입력값이 유효하지 않습니다',
      method: 'POST',
      route: '/api/posts/:postId',
      request: {
        params: { postId: 'wrong' },
        query: { page: 'wrong' },
        body: {
          title: '비밀 제목',
          nested: { email: 'person@example.com', categoryCode: 'STUDY' },
          unknown: '원문 값',
        },
      },
    });
  });

  it('multipart 원문과 크기 제한을 적용한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          route: { path: '/upload' },
          headers: { 'content-type': 'Multipart/Form-Data; boundary=example' },
          body: { request: '{"accessToken":"secret"}' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.INVALID_PARAMETER),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.not.objectContaining({ body: expect.anything() }),
      }),
    );
  });

  it('정제 중 접근 오류가 나도 Z005 응답을 유지하고 요청값은 생략한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const body = {};
    Object.defineProperty(body, 'broken', {
      enumerable: true,
      get: () => {
        throw new Error('cannot read request property');
      },
    });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', route: { path: '/items' }, body }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.INVALID_PARAMETER),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.not.objectContaining({ body: expect.anything() }) }),
    );
  });

  it('배열 형태 content-type도 보수적으로 body를 생략한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          route: { path: '/upload' },
          headers: { 'content-type': ['application/json'] },
          body: { token: 'secret' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.INVALID_PARAMETER),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.not.objectContaining({ body: expect.anything() }) }),
    );
  });

  it('과도한 원문 문자열과 순환 구조를 잘라낸다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const circular: Record<string, unknown> = { page: 'wrong', comment: 'a'.repeat(1_001) };
    circular.self = circular;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', route: { path: '/items' }, body: circular }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(AppErrorCode.INVALID_PARAMETER),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          body: { page: 'wrong', comment: '[TRUNCATED]', self: '[TRUNCATED]' },
        }),
      }),
    );
  });
});

describe('GlobalExceptionFilter의 예상하지 못한 예외 처리', () => {
  afterEach(() => jest.restoreAllMocks());

  it('500 응답을 만들고 원인 스택을 error 로그에 남긴다', () => {
    const exception = new Error('database connection failed');
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(exception, host as never);

    expect(error).toHaveBeenCalledWith('Unhandled exception', exception.stack);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INTERNAL_SERVER_ERROR',
        code: 'Z500',
      }),
    );
  });
});

describe('GlobalExceptionFilter의 서버 오류 처리', () => {
  afterEach(() => jest.restoreAllMocks());

  it('5xx HttpException은 원인 스택을 error 로그에 남긴다', () => {
    const exception = new ServiceUnavailableException('upstream unavailable');
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(exception, host as never);

    expect(error).toHaveBeenCalledWith('Unhandled HTTP exception', exception.stack);
  });
});
