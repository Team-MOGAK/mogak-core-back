import { describe, expect, it } from '@jest/globals';

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
});
