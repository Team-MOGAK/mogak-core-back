import { randomUUID } from 'node:crypto';

import type { Options as PinoHttpOptions } from 'pino-http';
import { LogEvent } from '@mogak/shared';
import { ConfigurationException } from '@infra/config/configuration.exception';
import type { AlertNotifier } from '@infra/alerting/alertNotifier';

import {
  requestErrorId,
  requestMethod,
  responseErrorLogContext,
  routeTemplate,
  type RequestLogContext,
} from './errorAlert.context';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const DEFAULT_SERVICE_NAME = 'mogak-core-api';
const LOG_PRODUCER = 'mogak-core-api';

const SEVERITY_BY_LEVEL: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export function createPinoHttpOptions(
  nodeEnv: string | undefined,
  configuredLevel: string | undefined,
  serviceName?: string,
  alertNotifier?: AlertNotifier,
): PinoHttpOptions {
  const environment = nodeEnv?.trim() || 'development';
  return {
    level: resolveLogLevel(nodeEnv, configuredLevel),
    genReqId: () => randomUUID(),
    base: {
      schemaVersion: 1,
      service: resolveServiceName(serviceName),
      environment,
      producer: LOG_PRODUCER,
    },
    formatters: {
      level: (label, number) => ({ level: number, severity: SEVERITY_BY_LEVEL[label] }),
    },
    customLogLevel: (_request, response, error) => {
      const statusCode = numericStatusCode(response);
      if (statusCode !== undefined) {
        if (statusCode >= 500) return 'error';
        if (statusCode >= 400) return 'warn';
        return 'info';
      }
      return error === undefined ? 'info' : 'error';
    },
    customSuccessObject: (request, response, value) =>
      completedRequestObject(request, response, value, alertNotifier),
    customErrorObject: (request, response, _error, value) =>
      completedRequestObject(request, response, value, alertNotifier),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.refreshtoken',
        'req.body.password',
        'req.body.secret',
        'req.body.token',
        'request.body.password',
        'request.body.secret',
        'request.body.token',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req: (request: { id?: unknown; method?: unknown; url?: unknown }) => ({
        id: request.id,
        method: request.method,
        path: requestPath(request.url),
      }),
      res: (response: { statusCode?: unknown }) => ({ statusCode: response.statusCode }),
    },
  };
}

export function resolveLogLevel(
  nodeEnv: string | undefined,
  configuredLevel: string | undefined,
): (typeof LOG_LEVELS)[number] {
  const candidate = configuredLevel?.trim().toLowerCase();
  if (candidate === undefined || candidate.length === 0) {
    return nodeEnv === 'development' ? 'debug' : 'info';
  }
  if (isLogLevel(candidate)) {
    return candidate;
  }
  throw new ConfigurationException(`LOG_LEVEL은 ${LOG_LEVELS.join(', ')} 중 하나여야 합니다.`);
}

function isLogLevel(value: string): value is (typeof LOG_LEVELS)[number] {
  return LOG_LEVELS.includes(value as (typeof LOG_LEVELS)[number]);
}

function requestPath(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.split('?', 1)[0];
}

function resolveServiceName(serviceName: string | undefined): string {
  const configured = serviceName?.trim();
  if (configured !== undefined && configured.length > 0) return configured;

  const runtimeService = process.env.K_SERVICE?.trim();
  return runtimeService === undefined || runtimeService.length === 0
    ? DEFAULT_SERVICE_NAME
    : runtimeService;
}

function numericStatusCode(response: { statusCode?: unknown }): number | undefined {
  const statusCode = response.statusCode;
  return typeof statusCode === 'number' && Number.isFinite(statusCode) ? statusCode : undefined;
}

function completedRequestObject(
  request: RequestLogContext,
  response: { statusCode?: unknown },
  value: Record<string, unknown>,
  alertNotifier?: AlertNotifier,
): Record<string, unknown> {
  const statusCode = numericStatusCode(response);
  if (statusCode === undefined || statusCode < 500) return value;

  const marker = responseErrorLogContext(response);
  const errorId = marker?.errorId ?? requestErrorId(request);
  const appCode = marker?.appCode;
  const route = routeTemplate(request);
  if (marker === undefined) {
    alertNotifier?.notify({
      event: LogEvent.HTTP_REQUEST_FAILED,
      errorId,
      statusCode,
      method: requestMethod(request),
      route,
    });
  }

  return {
    ...value,
    event: LogEvent.HTTP_REQUEST_FAILED,
    errorId,
    statusCode,
    method: requestMethod(request),
    route,
    alertEligible: marker === undefined,
    ...(appCode === undefined ? {} : { code: appCode, appCode }),
  };
}
