import { randomUUID } from 'node:crypto';
import type { ReqId } from 'pino-http';

export const RESPONSE_ERROR_LOG_MARKER = Symbol('response-error-log-marker');

export type RequestLogContext = {
  id?: ReqId;
  method?: string | undefined;
  baseUrl?: string;
  route?: { path?: string };
};

export type ResponseErrorLogContext = {
  errorId: string;
  appCode?: string;
};

export type ResponseWithErrorLogContext = {
  [RESPONSE_ERROR_LOG_MARKER]?: ResponseErrorLogContext;
  statusCode?: unknown;
};

export function requestErrorId(request: RequestLogContext | undefined): string {
  const id = request?.id;
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return randomUUID();
}

export function requestMethod(request: RequestLogContext | undefined): string {
  return typeof request?.method === 'string' && request.method.length > 0
    ? request.method
    : 'unknown';
}

export function routeTemplate(request: RequestLogContext | undefined): string | undefined {
  const path = request?.route?.path;
  if (typeof path !== 'string' || path.length === 0) return undefined;
  return `${request?.baseUrl ?? ''}${path}`;
}

export function markResponseErrorLog(response: unknown, context: ResponseErrorLogContext): void {
  if (!isResponseWithErrorLogContext(response)) return;
  response[RESPONSE_ERROR_LOG_MARKER] = context;
}

export function responseErrorLogContext(response: unknown): ResponseErrorLogContext | undefined {
  return isResponseWithErrorLogContext(response) ? response[RESPONSE_ERROR_LOG_MARKER] : undefined;
}

function isResponseWithErrorLogContext(value: unknown): value is ResponseWithErrorLogContext {
  return typeof value === 'object' && value !== null;
}
