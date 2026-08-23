import { randomUUID } from 'node:crypto';

import type { Options as PinoHttpOptions } from 'pino-http';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export function createPinoHttpOptions(
  nodeEnv: string | undefined,
  configuredLevel: string | undefined,
): PinoHttpOptions {
  return {
    level: resolveLogLevel(nodeEnv, configuredLevel),
    genReqId: () => randomUUID(),
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
  if (isLogLevel(candidate)) return candidate;
  throw new Error(`LOG_LEVEL은 ${LOG_LEVELS.join(', ')} 중 하나여야 합니다.`);
}

function isLogLevel(value: string): value is (typeof LOG_LEVELS)[number] {
  return LOG_LEVELS.includes(value as (typeof LOG_LEVELS)[number]);
}

function requestPath(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.split('?', 1)[0];
}
