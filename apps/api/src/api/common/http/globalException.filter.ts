import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { InjectPinoLogger } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
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
  if (status === HttpStatus.UNSUPPORTED_MEDIA_TYPE) return AppErrorCode.UNSUPPORTED_MEDIA_TYPE;
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return AppErrorCode.INTERNAL_SERVER_ERROR;

  return AppErrorCode.BAD_REQUEST;
}

type RequestForRateLimitLog = {
  method: string;
  baseUrl?: string;
  route?: { path?: string };
};

type RequestForDomainExceptionLog = RequestForRateLimitLog & {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  params?: unknown;
  query?: unknown;
};

const OMIT = Symbol('omit-request-log-value');
const TRUNCATED = '[TRUNCATED]';
const SENSITIVE_KEY_PARTS = ['authorization', 'cookie', 'password', 'secret', 'token'];
const MAX_LOG_DEPTH = 5;
const MAX_LOG_ARRAY_LENGTH = 20;
const MAX_LOG_OBJECT_KEYS = 30;
const MAX_LOG_STRING_LENGTH = 1_000;

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

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
        ...domainExceptionLog(http.getRequest<RequestForDomainExceptionLog>()),
      });
    } else if (exception instanceof HttpException) {
      if (exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error({ err: exceptionDetails(exception) }, 'Unhandled HTTP exception');
      }
    } else {
      this.logger.error(unhandledExceptionLog(exception), 'Unhandled exception');
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

type DatabaseErrorDetails = Readonly<{
  code?: string | undefined;
  constraint?: string | undefined;
  table?: string | undefined;
}>;

type ExceptionDetails = Readonly<{
  name: string;
  message: string;
  stack?: string | undefined;
  database?: DatabaseErrorDetails | undefined;
}>;

function databaseErrorDetails(exception: unknown): DatabaseErrorDetails | undefined {
  const cause = exception instanceof Error ? exception.cause : undefined;
  if (!isRecord(cause)) return undefined;

  const details = {
    code: stringOrUndefined(cause.code),
    constraint: stringOrUndefined(cause.constraint),
    table: stringOrUndefined(cause.table),
  } satisfies DatabaseErrorDetails;

  return Object.values(details).some((value) => value !== undefined) ? details : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function unhandledExceptionLog(exception: unknown): {
  event: 'unhandled_exception';
  err?: ExceptionDetails;
} {
  if (!(exception instanceof Error)) return { event: 'unhandled_exception' };
  return { event: 'unhandled_exception', err: exceptionDetails(exception) };
}

function exceptionDetails(error: Error): ExceptionDetails {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    database: databaseErrorDetails(error),
  };
}

function appErrorForDomainCode(code: string): AppErrorDefinition {
  const candidate = AppErrorCode[code as keyof typeof AppErrorCode];
  return candidate ?? AppErrorCode.INTERNAL_SERVER_ERROR;
}

function domainExceptionLog(request: RequestForDomainExceptionLog) {
  const params = safelySanitizeRequestField(request, 'params');
  const query = safelySanitizeRequestField(request, 'query');
  const body = isMultipartRequest(request) ? OMIT : safelySanitizeRequestField(request, 'body');

  return {
    method: request.method,
    route: staticRoute(request),
    request: {
      ...(params === OMIT ? {} : { params }),
      ...(query === OMIT ? {} : { query }),
      ...(body === OMIT ? {} : { body }),
    },
  };
}

function safelySanitizeRequestField(
  request: RequestForDomainExceptionLog,
  field: 'params' | 'query' | 'body',
): unknown | typeof OMIT {
  try {
    return safelySanitizeRequestValue(request[field]);
  } catch {
    return OMIT;
  }
}

function isMultipartRequest(request: RequestForDomainExceptionLog): boolean {
  try {
    const contentType = request.headers?.['content-type'];
    if (Array.isArray(contentType)) return true;
    return (
      typeof contentType === 'string' &&
      contentType.trim().toLowerCase().startsWith('multipart/form-data')
    );
  } catch {
    return true;
  }
}

function safelySanitizeRequestValue(value: unknown): unknown | typeof OMIT {
  try {
    return sanitizeRequestValue(value);
  } catch {
    return OMIT;
  }
}

function sanitizeRequestValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown | typeof OMIT {
  if (value === undefined) return OMIT;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.length <= MAX_LOG_STRING_LENGTH ? value : TRUNCATED;
  }
  if (depth >= MAX_LOG_DEPTH) return TRUNCATED;
  if (typeof value === 'object') {
    if (seen.has(value)) return TRUNCATED;
    seen.add(value);
  }
  if (Array.isArray(value)) {
    const values = value.slice(0, MAX_LOG_ARRAY_LENGTH).flatMap((item) => {
      const sanitized = sanitizeRequestValue(item, depth + 1, seen);
      return sanitized === OMIT ? [] : [sanitized];
    });
    return value.length > MAX_LOG_ARRAY_LENGTH ? [...values, TRUNCATED] : values;
  }
  if (!isRecord(value)) return OMIT;

  const sanitized = Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_LOG_OBJECT_KEYS)
      .flatMap(([key, item]) => {
        if (isSensitiveKey(key)) return [];
        const sanitizedValue = sanitizeRequestValue(item, depth + 1, seen);
        return sanitizedValue === OMIT ? [] : [[key, sanitizedValue]];
      }),
  );
  return Object.keys(value).length > MAX_LOG_OBJECT_KEYS
    ? { ...sanitized, __truncated__: TRUNCATED }
    : sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
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
