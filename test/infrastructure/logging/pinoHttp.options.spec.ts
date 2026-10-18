import { describe, expect, it, jest } from '@jest/globals';

import { RESPONSE_ERROR_LOG_MARKER } from '@infra/logging/errorAlert.context';
import { createPinoHttpOptions, resolveLogLevel } from '@infra/logging/pinoHttp.options';

describe('Pino HTTP logger 설정', () => {
  it('개발 환경에서는 명시값이 없을 때 debug 레벨과 서버 생성 요청 ID를 사용한다', () => {
    const options = createPinoHttpOptions('development', undefined);

    expect(options.level).toBe('debug');
    expect(options.genReqId?.({} as never, {} as never)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('운영 환경에서는 명시값이 없을 때 info 레벨을 사용한다', () => {
    expect(resolveLogLevel('production', undefined)).toBe('info');
  });

  it('명시한 유효 레벨을 사용하고 공백·대소문자를 정규화한다', () => {
    expect(resolveLogLevel('production', ' WARN ')).toBe('warn');
  });

  it('운영 환경에서 error를 숨기는 fatal threshold를 거부한다', () => {
    expect(() => resolveLogLevel('production', 'fatal')).toThrow(
      'production LOG_LEVEL은 error 이상을 기록해야 합니다.',
    );
  });

  it('잘못된 LOG_LEVEL은 부팅 전에 실패시킨다', () => {
    expect(() => resolveLogLevel('production', 'verbose')).toThrow(
      'LOG_LEVEL은 fatal, error, warn, info, debug, trace 중 하나여야 합니다.',
    );
  });

  it('민감 header와 body 필드 redaction 규칙을 둔다', () => {
    const options = createPinoHttpOptions('production', undefined);

    expect(options.redact).toEqual({
      paths: expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'request.body.token',
      ]),
      censor: '[REDACTED]',
    });
  });

  it('HTTP serializer는 header, body, query를 출력하지 않는다', () => {
    const options = createPinoHttpOptions('production', undefined);
    const request = options.serializers?.req?.({
      id: 'request-id',
      method: 'GET',
      url: '/health?token=secret',
      headers: { authorization: 'Bearer secret' },
      body: { password: 'secret' },
    });

    expect(request).toEqual({ id: 'request-id', method: 'GET', path: '/health' });
    expect(JSON.stringify(request)).not.toContain('secret');
  });

  it('공통 base metadata와 Cloud Logging severity를 추가하면서 숫자 level을 유지한다', () => {
    const options = createPinoHttpOptions('production', 'info', 'mogak-spring');

    expect(options.base).toEqual({
      schemaVersion: 1,
      service: 'mogak-spring',
      environment: 'production',
      producer: 'mogak-core-api',
    });
    expect(options.formatters?.level?.('error', 50)).toEqual({
      level: 50,
      severity: 'ERROR',
    });
    expect(options.formatters?.level?.('warn', 40)).toEqual({
      level: 40,
      severity: 'WARNING',
    });
  });

  it('HTTP status 기준으로 완료 레벨을 선택한다', () => {
    const options = createPinoHttpOptions('test', 'info');
    const customLogLevel = options.customLogLevel as NonNullable<typeof options.customLogLevel>;

    expect(customLogLevel({} as never, { statusCode: 204 } as never)).toBe('info');
    expect(customLogLevel({} as never, { statusCode: 404 } as never)).toBe('warn');
    expect(customLogLevel({} as never, { statusCode: 503 } as never)).toBe('error');
  });

  it('대표 오류 marker가 있으면 완료 5xx가 같은 errorId로 eligible false가 된다', () => {
    const options = createPinoHttpOptions('test', 'info');
    const requestId = '11111111-1111-4111-8111-111111111111';
    const request = {
      id: requestId,
      method: 'GET',
      baseUrl: '/api',
      route: { path: '/health/ready' },
    };
    const response = {
      statusCode: 503,
      [RESPONSE_ERROR_LOG_MARKER]: { errorId: requestId, appCode: 'Z006' },
    };
    const result = options.customErrorObject?.(
      request as never,
      response as never,
      new Error('private'),
      { responseTime: 1 },
    ) as Record<string, unknown>;

    expect(result).toEqual(
      expect.objectContaining({
        event: 'http_request_failed',
        errorId: requestId,
        alertEligible: false,
        statusCode: 503,
        method: 'GET',
        routeTemplate: '/health/ready',
        code: 'Z006',
        appCode: 'Z006',
      }),
    );
    expect(result).not.toHaveProperty('route');
  });

  it('대표 오류가 없는 완료 5xx는 alert notifier로 한 번 전달한다', () => {
    const notify = jest.fn();
    const options = createPinoHttpOptions('test', 'info', undefined, { notify });
    const requestId = '11111111-1111-4111-8111-111111111111';
    options.customErrorObject?.(
      { id: requestId, method: 'GET', route: { path: '/health/ready' } } as never,
      { statusCode: 503 } as never,
      new Error('private exception message'),
      {},
    );

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      event: 'http_request_failed',
      errorId: requestId,
      statusCode: 503,
      method: 'GET',
      routeTemplate: '/health/ready',
    });
    expect(JSON.stringify(notify.mock.calls)).not.toContain('private exception message');
  });

  it('대표 오류 marker가 있으면 완료 5xx는 재전달하지 않는다', () => {
    const notify = jest.fn();
    const options = createPinoHttpOptions('test', 'info', undefined, { notify });
    const requestId = '11111111-1111-4111-8111-111111111111';
    options.customErrorObject?.(
      { id: requestId, method: 'GET', route: { path: '/health/ready' } } as never,
      { statusCode: 503, [RESPONSE_ERROR_LOG_MARKER]: { errorId: requestId } } as never,
      new Error('private exception message'),
      {},
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('대표 오류 marker가 없으면 완료 5xx가 UUID fallback eligible 오류가 된다', () => {
    const options = createPinoHttpOptions('test', 'info');
    const result = options.customErrorObject?.(
      { id: 'request-id', method: 'GET', route: { path: '/health/ready' } } as never,
      { statusCode: 503 } as never,
      new Error('private'),
      {},
    ) as Record<string, unknown>;

    expect(result).toEqual(
      expect.objectContaining({
        event: 'http_request_failed',
        errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        alertEligible: true,
      }),
    );
  });
});
