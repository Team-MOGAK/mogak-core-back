import {
  Catch,
  HttpException,
  Inject,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DrizzleError, DrizzleQueryError } from 'drizzle-orm';
import { InjectPinoLogger } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import type { Response } from 'express';
import { LogEvent } from '@mogak/shared';

import { DomainException } from '@core/common/error/domainException';
import {
  markResponseErrorLog,
  requestErrorId,
  requestMethod,
  routeTemplate,
  type RequestLogContext,
} from '@infra/logging/errorAlert.context';
import { AppErrorCode, type AppErrorCode as AppErrorDefinition } from './appErrorCode';
import { ALERT_NOTIFIER, type AlertNotifier } from '@infra/alerting/alertNotifier';
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

type RequestForRateLimitLog = RequestLogContext;

type RequestForDomainExceptionLog = RequestForRateLimitLog & {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  params?: unknown;
  query?: unknown;
};

const DISABLED_ALERT_NOTIFIER: AlertNotifier = { notify: () => undefined };
const OMIT = Symbol('omit-request-log-value');
const TRUNCATED = '[TRUNCATED]';
const SENSITIVE_KEY_PARTS = ['authorization', 'cookie', 'password', 'secret', 'token'];
const MAX_LOG_DEPTH = 5;
const MAX_LOG_ARRAY_LENGTH = 20;
const MAX_LOG_OBJECT_KEYS = 30;
const MAX_LOG_STRING_LENGTH = 1_000;
const MULTIPART_INPUT_ERROR_CODES = new Set([
  'LIMIT_FIELD_ARRAY_INDEX',
  'LIMIT_FIELD_NESTING',
  'INVALID_FIELD_NAME',
]);

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name)
    private readonly logger: PinoLogger,
    @Inject(ALERT_NOTIFIER) private readonly alertNotifier: AlertNotifier = DISABLED_ALERT_NOTIFIER,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    if (exception instanceof ThrottlerException) {
      const request = requestFromHttp(http);
      const route = routeTemplate(request);
      this.logger.warn({
        event: 'rate_limit_rejected',
        method: requestMethod(request),
        route,
      });
      response.status(exception.getStatus()).json(throttlerResponse(exception));
      return;
    }

    if (isMultipartInputError(exception)) {
      this.logger.warn(
        { type: 'multipart_rejected', code: exception.code },
        'Multipart request rejected',
      );
      response.status(HttpStatus.BAD_REQUEST).json(errorResponse(AppErrorCode.BAD_REQUEST));
      return;
    }

    if (exception instanceof DomainException) {
      const error = appErrorForDomainCode(exception.code);
      const request = requestFromHttp(http);
      if (error.httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR) {
        reportServerException(
          this.logger,
          response,
          request,
          LogEvent.DOMAIN_EXCEPTION,
          error,
          undefined,
          'Domain exception',
          this.alertNotifier,
        );
      } else {
        this.logger.warn({
          event: LogEvent.DOMAIN_EXCEPTION,
          code: error.code,
          status: HttpStatus[error.httpStatus],
          message: error.message,
          ...domainExceptionLog(request),
        });
      }
    } else if (exception instanceof HttpException) {
      const error = errorForStatus(exception.getStatus());
      const request = requestFromHttp(http);
      const route = routeTemplate(request);
      if (error.httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR) {
        reportServerException(
          this.logger,
          response,
          request,
          LogEvent.HTTP_EXCEPTION,
          error,
          exceptionDetails(exception),
          'Unhandled HTTP exception',
          this.alertNotifier,
        );
      } else {
        this.logger.warn(
          {
            event: LogEvent.HTTP_EXCEPTION,
            statusCode: error.httpStatus,
            method: requestMethod(request),
            route,
          },
          'HTTP exception',
        );
      }
    } else {
      const request = requestFromHttp(http);
      reportServerException(
        this.logger,
        response,
        request,
        LogEvent.UNHANDLED_EXCEPTION,
        AppErrorCode.INTERNAL_SERVER_ERROR,
        exceptionDetails(exception),
        'Unhandled exception',
        this.alertNotifier,
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

function reportServerException(
  logger: PinoLogger,
  response: Response,
  request: RequestForRateLimitLog,
  event:
    | typeof LogEvent.DOMAIN_EXCEPTION
    | typeof LogEvent.HTTP_EXCEPTION
    | typeof LogEvent.UNHANDLED_EXCEPTION,
  error: AppErrorDefinition,
  details: ExceptionDetails | undefined,
  message: string,
  alertNotifier: AlertNotifier,
): void {
  const errorId = requestErrorId(request);
  markResponseErrorLog(response, { errorId, appCode: error.code });
  const route = routeTemplate(request);
  logger.error(
    {
      event,
      errorId,
      alertEligible: true,
      statusCode: error.httpStatus,
      code: error.code,
      appCode: error.code,
      method: requestMethod(request),
      route,
      err: details,
    },
    message,
  );
  alertNotifier.notify({
    event,
    errorId,
    statusCode: error.httpStatus,
    appCode: error.code,
    method: requestMethod(request),
    route,
  });
}

function requestFromHttp(
  http: ReturnType<ArgumentsHost['switchToHttp']>,
): RequestForDomainExceptionLog {
  try {
    const request = http.getRequest<RequestForDomainExceptionLog>();
    return isObject(request) ? (request as RequestForDomainExceptionLog) : {};
  } catch {
    return {};
  }
}

type DatabaseExceptionDetails = {
  code?: string | undefined;
  constraint?: string | undefined;
  table?: string | undefined;
};

type ExceptionDetails = Readonly<{
  name: string;
  message: string;
  stack?: string | undefined;
  database?: DatabaseExceptionDetails | undefined;
}>;

function databaseExceptionDetails(exception: unknown): DatabaseExceptionDetails | undefined {
  const seen = new WeakSet<object>();
  let current: unknown = exception;
  let isDatabaseError = false;
  const details: DatabaseExceptionDetails = {};

  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    if (current instanceof DrizzleQueryError || current instanceof DrizzleError) {
      isDatabaseError = true;
    }

    const code = safeDatabaseCode(current.code);
    const constraint = safeDatabaseIdentifier(current.constraint);
    const table = safeDatabaseIdentifier(current.table);
    if (details.code === undefined && code !== undefined) details.code = code;
    if (details.constraint === undefined && constraint !== undefined)
      details.constraint = constraint;
    if (details.table === undefined && table !== undefined) details.table = table;

    current = current.cause;
  }
  return isDatabaseError || Object.values(details).some((value) => value !== undefined)
    ? details
    : undefined;
}

function safeDatabaseCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : undefined;
}

function safeDatabaseIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function exceptionDetails(exception: unknown): ExceptionDetails | undefined {
  if (!(exception instanceof Error)) return undefined;

  const database = databaseExceptionDetails(exception);
  if (database !== undefined) {
    return { name: exception.name, message: 'Database operation failed', database };
  }

  return {
    name: exception.name,
    message: exception.message,
    stack: exception.stack,
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
  const route = routeTemplate(request);

  return {
    method: request.method,
    route,
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

function isMultipartInputError(exception: unknown): exception is { code: string } {
  return (
    isObject(exception) &&
    typeof exception.code === 'string' &&
    MULTIPART_INPUT_ERROR_CODES.has(exception.code)
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function throttlerResponse(exception: ThrottlerException): object {
  const response = exception.getResponse();
  return typeof response === 'string'
    ? { statusCode: exception.getStatus(), message: response }
    : response;
}
