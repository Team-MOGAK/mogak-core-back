export const KNOWN_EVENTS = [
  'domain_exception',
  'http_exception',
  'unhandled_exception',
  'http_request_failed',
  'database_pool_error',
] as const;

export type KnownEvent = (typeof KNOWN_EVENTS)[number];
export type NormalizedEvent = KnownEvent | 'unknown_error';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Provider-neutral reference to the trusted source of an alert. */
export type SourceReference = Readonly<{
  label: string;
  href: string;
}>;

/** The only source data that may cross from input validation into delivery. */
export type Alert = Readonly<{
  timestamp?: string;
  revision?: string;
  errorId: string;
  event: NormalizedEvent;
  appCode?: 'Z006' | 'Z500';
  statusCode?: number;
  method?: HttpMethod;
  route?: string;
  service: string;
  environment: 'production';
  source: SourceReference;
}>;

/** Safe, provider-neutral presentation data consumed by an output adapter. */
export type AlertSummary = Readonly<{
  event: NormalizedEvent;
  eventSummary: string;
  environment: 'production';
  service: string;
  revision?: string;
  errorId: string;
  timestamp?: string;
  statusCode?: number;
  appCode?: 'Z006' | 'Z500';
  appCodeSummary?: string;
  method?: HttpMethod;
  route?: string;
  source: SourceReference;
}>;

export const EVENT_SUMMARIES: Record<NormalizedEvent, string> = {
  domain_exception: 'API domain failure',
  http_exception: 'API HTTP failure',
  unhandled_exception: 'Unhandled API exception',
  http_request_failed: 'HTTP request failed',
  database_pool_error: 'Database pool failure',
  unknown_error: 'Unknown API error',
};

export const APP_CODE_SUMMARIES: Record<'Z006' | 'Z500', string> = {
  Z006: 'Storage is unavailable',
  Z500: 'Internal server error',
};

/**
 * These are the route templates currently registered by the API. Values are
 * emitted only after matching this fixed set, so path parameters and arbitrary
 * request paths never become alert content.
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

export function summarizeAlert(alert: Alert): AlertSummary {
  const route = routeTemplate(alert.route);
  return {
    event: alert.event,
    eventSummary: EVENT_SUMMARIES[alert.event],
    environment: alert.environment,
    service: alert.service,
    ...(alert.revision === undefined ? {} : { revision: alert.revision }),
    errorId: alert.errorId,
    ...(alert.timestamp === undefined ? {} : { timestamp: alert.timestamp }),
    ...(alert.statusCode === undefined ? {} : { statusCode: alert.statusCode }),
    ...(alert.appCode === undefined
      ? {}
      : { appCode: alert.appCode, appCodeSummary: APP_CODE_SUMMARIES[alert.appCode] }),
    ...(alert.method === undefined ? {} : { method: alert.method }),
    ...(route === undefined ? {} : { route }),
    source: alert.source,
  };
}

export function routeTemplate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return KNOWN_ROUTE_TEMPLATES.has(normalized) ? normalized : undefined;
}
