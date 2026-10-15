import type { RelayConfig } from './config.js';
import type { ClassifiedLogEntry } from './contracts.js';

export type DiscordPayload = Readonly<{
  content: string;
  allowed_mentions: Readonly<{
    parse: readonly [];
  }>;
}>;

const MAX_CONTENT_LENGTH = 1_800;

/**
 * These are the route templates currently registered by the API. The relay
 * only emits a route after it has matched this fixed set, so path parameters
 * and arbitrary request paths never become Discord content.
 */
export const KNOWN_ROUTE_TEMPLATES = new Set([
  '/health',
  '/health/ready',
  '/api/auth/:provider/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/withdraw',
  '/api/metadata/mogak-categories',
  '/api/metadata/colors',
  '/api/jobs',
  '/api/addresses',
  '/api/consents',
  '/api/users/marketing-consent',
  '/api/users/consents',
  '/api/users/nickname/verify',
  '/api/users/join',
  '/api/users/profile',
  '/api/users/profile/nickname',
  '/api/users/profile/job',
  '/api/users/profile/image',
  '/api/users/follows/:nickname',
  '/api/users/follows/counts/:nickname',
  '/api/users/follows/:nickname/motos',
  '/api/users/follows/:nickname/mentors',
  '/api/posts/pacemakers',
  '/api/posts',
  '/api/jogaks/:jogakId/posts',
  '/api/mogaks/:mogakId/posts',
  '/api/posts/:postId',
  '/api/posts/:postId/comments',
  '/api/posts/:postId/comments/:commentId',
  '/api/posts/like',
  '/api/modarats',
  '/api/modarats/:modaratId',
  '/api/modarats/:modaratId/mogaks',
  '/api/mogaks',
  '/api/mogaks/:mogakId',
  '/api/mogaks/:mogakId/jogaks',
  '/api/jogaks',
  '/api/jogaks/daily',
  '/api/jogaks/routines',
  '/api/jogaks/:jogakId',
  '/api/jogaks/:jogakId/executions/:scheduledDate/start',
  '/api/jogaks/:jogakId/executions/:scheduledDate/success',
  '/api/jogaks/:jogakId/executions/:scheduledDate/fail',
]);

const EVENT_SUMMARIES: Record<ClassifiedLogEntry['event'], string> = {
  domain_exception: 'API domain failure',
  http_exception: 'API HTTP failure',
  unhandled_exception: 'Unhandled API exception',
  http_request_failed: 'HTTP request failed',
  database_pool_error: 'Database pool failure',
  unknown_error: 'Unknown API error',
};

const APP_CODE_SUMMARIES: Record<'Z006' | 'Z500', string> = {
  Z006: 'Storage is unavailable',
  Z500: 'Internal server error',
};

export function buildDiscordPayload(
  entry: ClassifiedLogEntry,
  config: Pick<RelayConfig, 'gcpProjectId'>,
): DiscordPayload {
  const route = routeTemplate(entry.route);
  const lines = [
    `🚨 ${EVENT_SUMMARIES[entry.event]}`,
    `Environment: ${entry.environment}`,
    `Service: ${entry.service}`,
    ...(entry.revision === undefined ? [] : [`Revision: ${entry.revision}`]),
    `Error ID: ${entry.errorId}`,
    ...(entry.timestamp === undefined ? [] : [`Time: ${entry.timestamp}`]),
    ...(entry.statusCode === undefined ? [] : [`Status: ${entry.statusCode}`]),
    ...(entry.appCode === undefined
      ? []
      : [`App code: ${entry.appCode} (${APP_CODE_SUMMARIES[entry.appCode]})`]),
    ...(entry.method === undefined ? [] : [`Method: ${entry.method}`]),
    ...(route === undefined ? [] : [`Route: ${route}`]),
    `Logs: ${loggingLink(config.gcpProjectId, entry.errorId)}`,
  ];

  const content = lines.join('\n');
  return {
    content:
      content.length <= MAX_CONTENT_LENGTH
        ? content
        : `${content.slice(0, MAX_CONTENT_LENGTH - 1)}…`,
    allowed_mentions: { parse: [] },
  };
}

export function routeTemplate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return KNOWN_ROUTE_TEMPLATES.has(normalized) ? normalized : undefined;
}

export function loggingLink(projectId: string, errorId: string): string {
  const query = `jsonPayload.errorId="${errorId}"`;
  return `https://console.cloud.google.com/logs/query?project=${encodeURIComponent(
    projectId,
  )}&query=${encodeURIComponent(query)}`;
}
