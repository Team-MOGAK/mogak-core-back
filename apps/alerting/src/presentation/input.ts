import { METHODS } from 'node:http';
import shared from '@mogak/shared';
import type { LogEvent as SharedLogEvent } from '@mogak/shared';

import { MAX_PUBSUB_DATA_BYTES } from './constants.js';
import type { PresentationConfig } from './types.js';
import {
  resolveAppErrorCode,
  type Alert,
  type SourceReference,
} from '../application/type/alert.type.js';

const HTTP_METHODS = new Set(METHODS);
const TRUSTED_PRODUCER = 'mogak-core-api';
const { LogEvent } = shared;

export type ClassificationResult =
  | Readonly<{ kind: 'match'; entry: ClassifiedLogEntry }>
  | Readonly<{ kind: 'ignore'; reason: ClassificationIgnoreReason }>;

export type ClassifiedLogEntry = Omit<Alert, 'source'> &
  Readonly<{
    projectId: string;
  }>;

export type PushEnvelopeParseResult =
  Readonly<{ ok: true; logEntry: unknown }> | Readonly<{ ok: false; reason: EnvelopeRejectReason }>;

export type EnvelopeRejectReason =
  | 'envelope_not_object'
  | 'subscription_mismatch'
  | 'message_missing'
  | 'data_missing'
  | 'data_not_base64'
  | 'data_too_large'
  | 'data_not_utf8'
  | 'data_not_json'
  | 'log_entry_not_object';

export type ClassificationIgnoreReason =
  | 'wrong_resource'
  | 'wrong_project'
  | 'wrong_service'
  | 'wrong_producer'
  | 'wrong_log_name'
  | 'wrong_severity'
  | 'wrong_payload'
  | 'wrong_environment'
  | 'wrong_level'
  | 'not_alert_eligible'
  | 'invalid_timestamp'
  | 'invalid_error_id'
  | 'invalid_event'
  | 'invalid_status_code'
  | 'invalid_method';

export function parsePushEnvelope(
  value: unknown,
  expectedSubscription: string,
): PushEnvelopeParseResult {
  if (!isRecord(value)) return { ok: false, reason: 'envelope_not_object' };
  if (value.subscription !== expectedSubscription) {
    return { ok: false, reason: 'subscription_mismatch' };
  }
  if (!isRecord(value.message)) return { ok: false, reason: 'message_missing' };

  const data = value.message.data;
  if (typeof data !== 'string' || data.length === 0) {
    return { ok: false, reason: 'data_missing' };
  }
  if (!isStrictBase64(data)) return { ok: false, reason: 'data_not_base64' };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(data, 'base64');
  } catch {
    return { ok: false, reason: 'data_not_base64' };
  }
  if (bytes.byteLength > MAX_PUBSUB_DATA_BYTES) {
    return { ok: false, reason: 'data_too_large' };
  }

  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'data_not_utf8' };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'data_not_json' };
  }
  return isRecord(decoded)
    ? { ok: true, logEntry: decoded }
    : { ok: false, reason: 'log_entry_not_object' };
}

export function classifyLogEntry(value: unknown, config: PresentationConfig): ClassificationResult {
  if (!isRecord(value)) return { kind: 'ignore', reason: 'wrong_payload' };
  if (value.logName !== stdoutLogName(config.gcpProjectId)) {
    return { kind: 'ignore', reason: 'wrong_log_name' };
  }
  if (value.severity !== 'ERROR') return { kind: 'ignore', reason: 'wrong_severity' };
  if (!isRecord(value.resource) || value.resource.type !== 'cloud_run_revision') {
    return { kind: 'ignore', reason: 'wrong_resource' };
  }
  if (!isRecord(value.resource.labels)) return { kind: 'ignore', reason: 'wrong_resource' };
  if (value.resource.labels.project_id !== config.gcpProjectId) {
    return { kind: 'ignore', reason: 'wrong_project' };
  }
  if (value.resource.labels.service_name !== config.sourceApiService) {
    return { kind: 'ignore', reason: 'wrong_service' };
  }
  if (!isRecord(value.jsonPayload)) return { kind: 'ignore', reason: 'wrong_payload' };

  const payload = value.jsonPayload;
  if (payload.schemaVersion !== 1) return { kind: 'ignore', reason: 'wrong_payload' };
  if (payload.environment !== config.sourceEnvironment) {
    return { kind: 'ignore', reason: 'wrong_environment' };
  }
  if (payload.producer !== TRUSTED_PRODUCER) {
    return { kind: 'ignore', reason: 'wrong_producer' };
  }
  if (payload.service !== config.sourceApiService) {
    return { kind: 'ignore', reason: 'wrong_service' };
  }
  if (payload.level !== 50) return { kind: 'ignore', reason: 'wrong_level' };
  if (payload.alertEligible !== true) {
    return { kind: 'ignore', reason: 'not_alert_eligible' };
  }

  const timestamp = safeTimestamp(value.timestamp);
  if (timestamp === undefined) return { kind: 'ignore', reason: 'invalid_timestamp' };

  const errorId = payload.errorId;
  if (typeof errorId !== 'string' || !isUuid(errorId)) {
    return { kind: 'ignore', reason: 'invalid_error_id' };
  }
  const rawEvent = payload.event;
  if (typeof rawEvent !== 'string' || rawEvent.trim().length === 0) {
    return { kind: 'ignore', reason: 'invalid_event' };
  }
  const statusCode = payload.statusCode;
  if (
    statusCode !== undefined &&
    (typeof statusCode !== 'number' ||
      !Number.isInteger(statusCode) ||
      statusCode < 500 ||
      statusCode > 599)
  ) {
    return { kind: 'ignore', reason: 'invalid_status_code' };
  }
  if (payload.method !== undefined && safeMethod(payload.method) === undefined) {
    return { kind: 'ignore', reason: 'invalid_method' };
  }

  const appCode = resolveAppErrorCode(payload.appCode ?? payload.code);
  const method = safeMethod(payload.method);
  const routeTemplate = safeRouteTemplate(payload.routeTemplate);
  const event = isKnownEvent(rawEvent) ? rawEvent : LogEvent.UNKNOWN_ERROR;

  return {
    kind: 'match',
    entry: {
      timestamp,
      errorId,
      event,
      ...(appCode === undefined ? {} : { appCode: appCode.code, appCodeSummary: appCode.summary }),
      ...(statusCode === undefined ? {} : { statusCode }),
      ...(method === undefined ? {} : { method }),
      ...(routeTemplate === undefined ? {} : { routeTemplate }),
      service: config.sourceApiService,
      environment: config.sourceEnvironment,
      projectId: config.gcpProjectId,
    },
  };
}

export function stdoutLogName(projectId: string): string {
  return `projects/${projectId}/logs/run.googleapis.com%2Fstdout`;
}

/** Create the application DTO only after the Cloud Logging source checks pass. */
export function toAlert(entry: ClassifiedLogEntry): Alert {
  const source: SourceReference = {
    label: 'Logs',
    href: loggingLink(entry.projectId, entry.errorId),
  };
  return {
    timestamp: entry.timestamp,
    errorId: entry.errorId,
    event: entry.event,
    ...(entry.appCode === undefined ? {} : { appCode: entry.appCode }),
    ...(entry.appCodeSummary === undefined ? {} : { appCodeSummary: entry.appCodeSummary }),
    ...(entry.statusCode === undefined ? {} : { statusCode: entry.statusCode }),
    ...(entry.method === undefined ? {} : { method: entry.method }),
    ...(entry.routeTemplate === undefined ? {} : { routeTemplate: entry.routeTemplate }),
    service: entry.service,
    environment: entry.environment,
    source,
  };
}

export function loggingLink(projectId: string, errorId: string): string {
  const query = `jsonPayload.errorId="${errorId}"`;
  return `https://console.cloud.google.com/logs/query?project=${encodeURIComponent(
    projectId,
  )}&query=${encodeURIComponent(query)}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function safeMethod(value: unknown): string | undefined {
  return typeof value === 'string' && HTTP_METHODS.has(value) ? value : undefined;
}

function safeRouteTemplate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return undefined;
  if (!value.startsWith('/') || value.includes('?') || value.includes('#')) return undefined;
  const segments = value.slice(1).split('/');
  if (segments.some((segment) => segment.length === 0)) return undefined;
  return segments.every((segment) =>
    segment.startsWith(':')
      ? /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment)
      : /^[A-Za-z0-9._~-]+$/.test(segment),
  )
    ? value
    : undefined;
}

function safeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function isKnownEvent(value: string): value is SharedLogEvent {
  return Object.values(LogEvent).some((event) => event === value);
}

function isStrictBase64(value: string): boolean {
  return (
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value) &&
    Buffer.from(value, 'base64').toString('base64') === value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
