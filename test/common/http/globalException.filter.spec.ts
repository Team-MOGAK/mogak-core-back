import { HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ThrottlerException } from '@nestjs/throttler';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { GlobalExceptionFilter } from '@api/common/http/globalException.filter';

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
        getRequest: () => ({ method: 'GET', route: { path: '/users/:id' }, params: { id: '42' } }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
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

  it('Z005가 아닌 DomainException도 정제된 요청 원문과 오류 정보를 warn 로그에 남긴다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          baseUrl: '/api',
          route: { path: '/users/:id' },
          params: { id: 'wrong' },
          query: { include: 'profile', access_token: 'query-secret' },
          body: { token: 'body-secret', nickname: 'moga' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith({
      type: 'domain_exception',
      code: 'U001',
      status: 'NOT_FOUND',
      message: '존재하지 않는 사용자입니다',
      method: 'GET',
      route: '/api/users/:id',
      request: {
        params: { id: 'wrong' },
        query: { include: 'profile' },
        body: { nickname: 'moga' },
      },
    });
  });

  it('권한 거부도 같은 도메인 예외 로그 형식을 사용한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'DELETE',
          route: { path: '/posts/:id' },
          params: { id: 'missing' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.FORBIDDEN),
      host as never,
    );

    expect(warn).toHaveBeenCalledWith({
      type: 'domain_exception',
      code: 'T004',
      status: 'FORBIDDEN',
      message: '권한이 부여되지 않았습니다',
      method: 'DELETE',
      route: '/posts/:id',
      request: { params: { id: 'missing' } },
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
            nested: {
              accessToken: 'nested-secret',
              email: 'person@example.com',
              categoryCode: 'STUDY',
            },
            unknown: '원문 값',
          },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.INVALID_PARAMETER),
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

  it('multipart 원문과 배열 형태 content-type을 생략한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          route: { path: '/upload' },
          headers: { 'content-type': ['Multipart/Form-Data; boundary=example'] },
          body: { request: '{"accessToken":"secret"}' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.INVALID_PARAMETER),
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
      new DomainException(DomainErrorCode.INVALID_PARAMETER),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.not.objectContaining({ body: expect.anything() }),
      }),
    );
  });

  it('최상위 요청 필드 접근 오류가 나도 DomainException 응답을 유지한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const request = { method: 'GET', route: { path: '/users/:id' }, params: { id: '42' } };
    Object.defineProperty(request, 'query', {
      enumerable: true,
      get: () => {
        throw new Error('cannot read query');
      },
    });
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        request: { params: { id: '42' } },
      }),
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
      new DomainException(DomainErrorCode.INVALID_PARAMETER),
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

describe('GlobalExceptionFilter의 core 예외 처리', () => {
  afterEach(() => jest.restoreAllMocks());

  it('DomainException를 기존 AppErrorCode HTTP 계약으로 변환한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/users/:id' }, params: { id: '42' } }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
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
    expect(warn).toHaveBeenCalledWith({
      type: 'domain_exception',
      code: 'U001',
      status: 'NOT_FOUND',
      message: '존재하지 않는 사용자입니다',
      method: 'GET',
      route: '/users/:id',
      request: { params: { id: '42' } },
    });
  });

  it('등록되지 않은 DomainException code는 내부 서버 오류로 변환한다', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          route: { path: '/items/:id' },
          params: { id: 'unknown' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(
      new DomainException('UNMAPPED_CORE_ERROR' as DomainErrorCode),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INTERNAL_SERVER_ERROR',
        code: 'Z500',
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
    const getRequest = jest.fn(() => ({ body: { token: 'must-not-log' } }));
    const host = {
      switchToHttp: () => ({
        getRequest,
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(exception, host as never);

    expect(error).toHaveBeenCalledWith(
      { event: 'unhandled_exception', database: undefined },
      exception.stack,
    );
    expect(getRequest).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INTERNAL_SERVER_ERROR',
        code: 'Z500',
      }),
    );
  });

  it('DB 제약 오류에서는 제약 식별자만 안전하게 남긴다', () => {
    const exception = new Error('Failed query', {
      cause: { code: '23503', constraint: 'mogak_modarat_id_fkey', table: 'mogak' },
    });
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };

    new GlobalExceptionFilter().catch(exception, host as never);

    expect(error).toHaveBeenCalledWith(
      {
        event: 'unhandled_exception',
        database: { code: '23503', constraint: 'mogak_modarat_id_fkey', table: 'mogak' },
      },
      exception.stack,
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
    const getRequest = jest.fn(() => ({ body: { token: 'must-not-log' } }));
    const host = {
      switchToHttp: () => ({
        getRequest,
        getResponse: () => ({ status }),
      }),
    };

    new GlobalExceptionFilter().catch(exception, host as never);

    expect(error).toHaveBeenCalledWith('Unhandled HTTP exception', exception.stack);
    expect(getRequest).not.toHaveBeenCalled();
  });
});
