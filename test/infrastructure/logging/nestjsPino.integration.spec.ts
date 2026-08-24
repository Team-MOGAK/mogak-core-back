import { Writable } from 'node:stream';

import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from '@jest/globals';
import { Logger as NestjsPinoLogger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { configureApp } from '@api/app.setup';
import { GlobalExceptionFilter } from '@api/common/http/globalException.filter';
import { createPinoHttpOptions } from '@infra/logging/pinoHttp.options';

@Controller('pino-logging-test')
class PinoLoggingTestController {
  @Get()
  get(): never {
    throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
  }

  @Get('http-error')
  httpError(): never {
    throw new HttpException(
      { error: 'upstream failure', token: 'http-exception-secret' },
      HttpStatus.BAD_GATEWAY,
    );
  }

  @Get('unhandled-error')
  unhandledError(): never {
    const error = Object.assign(new Error('unhandled failure'), {
      password: 'top-level-password',
      query: 'select * from users where token = secret',
      parameters: ['database-parameter-secret'],
      cause: { secret: 'cause-secret' },
    });
    throw error;
  }
}

describe('nestjs-pino 요청 컨텍스트', () => {
  it('PinoLogger 예외 로그는 req.id를 유지하면서 원본 예외의 민감 속성을 출력하지 않는다', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const module = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [createPinoHttpOptions('test', 'info'), stream],
        }),
      ],
      controllers: [PinoLoggingTestController],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    }).compile();
    const app = module.createNestApplication();
    app.useLogger(app.get(NestjsPinoLogger));
    configureApp(app);
    await app.init();
    await app.listen(0);

    try {
      await request(app.getHttpServer()).get('/pino-logging-test').expect(404);
      await request(app.getHttpServer()).get('/pino-logging-test/http-error').expect(500);
      await request(app.getHttpServer()).get('/pino-logging-test/unhandled-error').expect(500);
      await new Promise<void>((resolve) => setImmediate(resolve));

      const logs = lines.flatMap((line) =>
        line
          .split('\n')
          .filter((entry) => entry.length > 0)
          .map((entry) => JSON.parse(entry) as Record<string, unknown>),
      );
      const domainException = logs.find((log) => log.type === 'domain_exception');
      const requestCompleted = logs.find((log) => log.msg === 'request completed');

      expect(domainException).toEqual(
        expect.objectContaining({
          req: expect.objectContaining({ id: expect.any(String) }),
          type: 'domain_exception',
        }),
      );
      expect(requestCompleted).toEqual(
        expect.objectContaining({
          req: expect.objectContaining({ id: expect.any(String) }),
        }),
      );
      expect((domainException?.req as { id: string }).id).toBe(
        (requestCompleted?.req as { id: string }).id,
      );

      const httpException = logs.find((log) => log.msg === 'Unhandled HTTP exception');
      const unhandledException = logs.find((log) => log.msg === 'Unhandled exception');
      expect(httpException).toEqual(
        expect.objectContaining({
          err: expect.objectContaining({ name: 'HttpException', message: expect.any(String) }),
          req: expect.objectContaining({ id: expect.any(String) }),
        }),
      );
      expect(unhandledException).toEqual(
        expect.objectContaining({
          err: expect.objectContaining({ name: 'Error', message: 'unhandled failure' }),
          req: expect.objectContaining({ id: expect.any(String) }),
        }),
      );
      const serializedLogs = JSON.stringify(logs);
      for (const secret of [
        'http-exception-secret',
        'top-level-password',
        'database-parameter-secret',
        'cause-secret',
      ]) {
        expect(serializedLogs).not.toContain(secret);
      }
    } finally {
      await app.close();
      await module.close();
    }
  });
});
