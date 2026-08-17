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

import { DomainException } from '@core/common/error/domainException';
import { AppErrorCode, type AppErrorCode as AppErrorDefinition } from './appErrorCode';
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
      const error = appErrorForDomainCode(exception.code);
      this.logger.warn({
        type: 'domain_exception',
        code: error.code,
        status: HttpStatus[error.httpStatus],
        message: error.message,
      });
    } else if (exception instanceof HttpException) {
      if (exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error('Unhandled HTTP exception', exception.stack);
      }
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const error =
      exception instanceof DomainException
        ? appErrorForDomainCode(exception.code)
        : exception instanceof HttpException
          ? errorForStatus(exception.getStatus())
          : AppErrorCode.INTERNAL_SERVER_ERROR;

    response.status(error.httpStatus).json(errorResponse(error));
  }
}

function appErrorForDomainCode(code: string): AppErrorDefinition {
  const candidate = AppErrorCode[code as keyof typeof AppErrorCode];
  return candidate ?? AppErrorCode.INTERNAL_SERVER_ERROR;
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
