export const LogEvent = {
  DOMAIN_EXCEPTION: 'domain_exception',
  HTTP_EXCEPTION: 'http_exception',
  UNHANDLED_EXCEPTION: 'unhandled_exception',
  HTTP_REQUEST_FAILED: 'http_request_failed',
  DATABASE_POOL_ERROR: 'database_pool_error',
  READINESS_FAILED: 'readiness_failed',
  READINESS_RECOVERED: 'readiness_recovered',
  UNKNOWN_ERROR: 'unknown_error',
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];

export const LogEventSummary: Readonly<Record<LogEvent, string>> = {
  domain_exception: 'API domain failure',
  http_exception: 'API HTTP failure',
  unhandled_exception: 'Unhandled API exception',
  http_request_failed: 'HTTP request failed',
  database_pool_error: 'Database pool failure',
  readiness_failed: 'Readiness check failed (database unavailable)',
  readiness_recovered: 'Readiness check recovered',
  unknown_error: 'Unknown API error',
};
