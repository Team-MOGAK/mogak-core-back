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

import { AppErrorCode, type AppErrorCode as AppErrorDefinition } from './app-error-code';
import { AppException } from './app.exception';
import { errorResponse } from './api-response';

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
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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

    const error =
      exception instanceof AppException
        ? exception.errorCode
        : exception instanceof HttpException
          ? errorForStatus(exception.getStatus())
          : AppErrorCode.INTERNAL_SERVER_ERROR;

    response.status(error.httpStatus).json(errorResponse(error));
  }
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
