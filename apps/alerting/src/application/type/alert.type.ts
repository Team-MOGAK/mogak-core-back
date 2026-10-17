import shared from '@mogak/shared';
import type { LogEvent as SharedLogEvent } from '@mogak/shared';

const { AppErrorCode, LogEventSummary } = shared;

export type SourceEnvironment = 'development' | 'production';

const APP_ERROR_DEFINITIONS = Object.values(AppErrorCode);

/** Resolve a producer error code without maintaining a second application-code map. */
export function resolveAppErrorCode(
  value: unknown,
): Readonly<{ code: string; summary: string }> | undefined {
  if (typeof value !== 'string') return undefined;
  const definition = APP_ERROR_DEFINITIONS.find((item) => item.code === value);
  return definition === undefined
    ? undefined
    : { code: definition.code, summary: definition.message };
}

/** Provider-neutral reference to the trusted source of an alert. */
export type SourceReference = Readonly<{
  label: string;
  href: string;
}>;

/** The only source data that may cross from input validation into delivery. */
export type Alert = Readonly<{
  timestamp: string;
  errorId: string;
  event: SharedLogEvent;
  appCode?: string;
  appCodeSummary?: string;
  statusCode?: number;
  method?: string;
  routeTemplate?: string;
  service: string;
  environment: SourceEnvironment;
  source: SourceReference;
}>;

/** Safe, provider-neutral presentation data consumed by an output adapter. */
export type AlertSummary = Alert & Readonly<{ eventSummary: string }>;

export function summarizeAlert(alert: Alert): AlertSummary {
  return {
    ...alert,
    eventSummary: LogEventSummary[alert.event],
  };
}
