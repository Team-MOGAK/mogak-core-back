import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

import { AppErrorCode, type AppErrorCode as AppErrorDefinition } from './appErrorCode';
import { DomainException } from './domain.exception';
import { errorResponse } from './apiResponse';

function errorForStatus(status: number): AppErrorDefinition {
  if (status === HttpStatus.NOT_FOUND) return AppErrorCode.NOT_FOUND;
  if (status === HttpStatus.UNAUTHORIZED) return AppErrorCode.UNAUTHORIZED;
  if (status === HttpStatus.FORBIDDEN) return AppErrorCode.FORBIDDEN;
  if (status === HttpStatus.CONFLICT) return AppErrorCode.CONFLICT;
  if (status === HttpStatus.METHOD_NOT_ALLOWED) return AppErrorCode.METHOD_NOT_ALLOWED;
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return AppErrorCode.INTERNAL_SERVER_ERROR;

  return AppErrorCode.BAD_REQUEST;
}

type RequestForRateLimitLog = {
  method: string;
  baseUrl?: string;
  route?: { path?: string };
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    if (exception instanceof ThrottlerException) {
      const request = http.getRequest<RequestForRateLimitLog>();
      this.logger.warn({
        event: 'rate_limit_rejected',
        method: request.method,
        route: staticRoute(request),
      });
      response.status(exception.getStatus()).json(throttlerResponse(exception));
      return;
    }

    if (exception instanceof DomainException) {
      this.logger.warn({
        type: 'domain_exception',
        code: exception.errorCode.code,
        status: HttpStatus[exception.errorCode.httpStatus],
        message: exception.errorCode.message,
      });
    } else if (exception instanceof HttpException) {
      if (exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error('Unhandled HTTP exception', exception.stack);
      }
    } else {
      this.logger.error(
        {
          event: 'unhandled_exception',
          database: databaseErrorDetails(exception),
        },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const error =
      exception instanceof DomainException
        ? exception.errorCode
        : exception instanceof HttpException
          ? errorForStatus(exception.getStatus())
          : AppErrorCode.INTERNAL_SERVER_ERROR;

    response.status(error.httpStatus).json(errorResponse(error));
  }
}

function databaseErrorDetails(
  exception: unknown,
): Readonly<{ code?: string; constraint?: string; table?: string }> | undefined {
  if (!(exception instanceof Error) || !('cause' in exception)) return undefined;
  const cause = exception.cause;
  if (typeof cause !== 'object' || cause === null) return undefined;
  const details = cause as Record<string, unknown>;
  const code = typeof details.code === 'string' ? details.code : undefined;
  const constraint = typeof details.constraint === 'string' ? details.constraint : undefined;
  const table = typeof details.table === 'string' ? details.table : undefined;
  return code === undefined && constraint === undefined && table === undefined
    ? undefined
    : {
        ...(code === undefined ? {} : { code }),
        ...(constraint === undefined ? {} : { constraint }),
        ...(table === undefined ? {} : { table }),
      };
}

function staticRoute(request: RequestForRateLimitLog): string {
  const path = request.route?.path;
  return typeof path === 'string' ? `${request.baseUrl ?? ''}${path}` : 'unknown';
}

function throttlerResponse(exception: ThrottlerException): object {
  const response = exception.getResponse();
  return typeof response === 'string'
    ? { statusCode: exception.getStatus(), message: response }
    : response;
}
