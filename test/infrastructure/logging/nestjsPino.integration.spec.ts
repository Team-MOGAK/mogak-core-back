import { Writable } from 'node:stream';

import { Controller, Get, HttpException, HttpStatus, Res } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from '@jest/globals';
import { Logger as NestjsPinoLogger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { Response } from 'express';

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

  @Get('direct-service-unavailable')
  directServiceUnavailable(@Res({ passthrough: true }) response: Response): {
    status: 'unavailable';
  } {
    response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: 'unavailable' };
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
      await request(app.getHttpServer())
        .get('/pino-logging-test/direct-service-unavailable')
        .expect(503)
        .expect({ status: 'unavailable' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const logs = lines.flatMap((line) =>
        line
          .split('\n')
          .filter((entry) => entry.length > 0)
          .map((entry) => JSON.parse(entry) as Record<string, unknown>),
      );
      const domainException = logs.find((log) => log.event === 'domain_exception');
      const requestCompleted = logs.find((log) => log.msg === 'request completed');
      const failedRequest = logs.find((log) => log.event === 'http_request_failed');
      const directFallbacks = logs.filter(
        (log) =>
          log.event === 'http_request_failed' &&
          log.alertEligible === true &&
          log.statusCode === HttpStatus.SERVICE_UNAVAILABLE &&
          log.routeTemplate === '/pino-logging-test/direct-service-unavailable',
      );

      expect(directFallbacks).toHaveLength(1);
      expect(directFallbacks[0]).toEqual(
        expect.objectContaining({
          level: 50,
          severity: 'ERROR',
          event: 'http_request_failed',
          errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          alertEligible: true,
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          method: 'GET',
          routeTemplate: '/pino-logging-test/direct-service-unavailable',
        }),
      );

      expect(domainException).toEqual(
        expect.objectContaining({
          level: 40,
          severity: 'WARNING',
          req: expect.objectContaining({ id: expect.any(String) }),
          event: 'domain_exception',
        }),
      );
      expect(domainException?.alertEligible).not.toBe(true);
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
          event: 'http_exception',
          errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          statusCode: 500,
          alertEligible: true,
          err: expect.objectContaining({ name: 'HttpException', message: expect.any(String) }),
          req: expect.objectContaining({ id: expect.any(String) }),
        }),
      );
      expect(failedRequest).toEqual(
        expect.objectContaining({
          event: 'http_request_failed',
          errorId: (httpException as { errorId: string }).errorId,
          statusCode: 500,
          alertEligible: false,
          req: expect.objectContaining({ id: expect.any(String) }),
        }),
      );
      expect(unhandledException).toEqual(
        expect.objectContaining({
          event: 'unhandled_exception',
          errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          statusCode: 500,
          alertEligible: true,
          err: expect.objectContaining({ name: 'Error', message: 'unhandled failure' }),
          req: expect.objectContaining({ id: expect.any(String) }),
        }),
      );

      for (const canonicalEvent of ['http_exception', 'unhandled_exception']) {
        const canonicalLog = logs.find((log) => log.event === canonicalEvent);
        expect(canonicalLog).toEqual(
          expect.objectContaining({
            level: 50,
            severity: 'ERROR',
            errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
            alertEligible: true,
          }),
        );

        const canonicalErrorId = (canonicalLog as { errorId: string }).errorId;
        const eligibleLogs = logs.filter(
          (log) => log.errorId === canonicalErrorId && log.alertEligible === true,
        );
        expect(eligibleLogs).toHaveLength(1);
        expect(
          logs.filter(
            (log) => log.errorId === canonicalErrorId && log.event === 'http_request_failed',
          ),
        ).toEqual([
          expect.objectContaining({
            alertEligible: false,
            errorId: canonicalErrorId,
          }),
        ]);
      }

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
