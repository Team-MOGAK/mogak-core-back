import { MAX_PUBSUB_DATA_BYTES, SOURCE_ENVIRONMENT } from './constants.js';
import type { PresentationConfig } from './types.js';
import {
  KNOWN_EVENTS,
  type Alert,
  type HttpMethod,
  type KnownEvent,
  type NormalizedEvent,
  type SourceReference,
} from '../application/contracts.js';

export type PubSubPushEnvelope = Readonly<{
  message: Readonly<{
    data: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  }>;
  subscription: string;
}>;

export type LogEntry = Readonly<{
  logName: string;
  resource: Readonly<{
    type: string;
    labels: Readonly<Record<string, unknown>>;
  }>;
  severity: string;
  timestamp?: string;
  jsonPayload: Readonly<Record<string, unknown>>;
}>;

export type ClassifiedLogEntry = Readonly<{
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
  logName: string;
  projectId: string;
}>;

export type PushEnvelopeParseResult =
  | Readonly<{
      ok: true;
      envelope: PubSubPushEnvelope;
      logEntry: LogEntry;
      messageId?: string;
      publishTime?: string;
    }>
  | Readonly<{
      ok: false;
      reason: EnvelopeRejectReason;
    }>;

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

export type ClassificationResult =
  | Readonly<{
      kind: 'match';
      entry: ClassifiedLogEntry;
    }>
  | Readonly<{
      kind: 'ignore';
      reason: ClassificationIgnoreReason;
    }>;

export type ClassificationIgnoreReason =
  | 'wrong_resource'
  | 'wrong_project'
  | 'wrong_service'
  | 'wrong_log_name'
  | 'wrong_severity'
  | 'wrong_payload'
  | 'wrong_environment'
  | 'wrong_level'
  | 'not_alert_eligible'
  | 'invalid_error_id'
  | 'invalid_event'
  | 'invalid_status_code';

export function parsePushEnvelope(
  value: unknown,
  options: { expectedSubscription?: string } | string = {},
): PushEnvelopeParseResult {
  const expectedSubscription = typeof options === 'string' ? options : options.expectedSubscription;
  if (!isRecord(value)) return { ok: false, reason: 'envelope_not_object' };
  if (expectedSubscription !== undefined && value.subscription !== expectedSubscription) {
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
  if (!isRecord(decoded)) return { ok: false, reason: 'log_entry_not_object' };

  const subscription = value.subscription;
  if (typeof subscription !== 'string' || subscription.length === 0) {
    return { ok: false, reason: 'subscription_mismatch' };
  }

  const messageId = optionalString(value.message.messageId);
  const publishTime = optionalString(value.message.publishTime);
  const attributes = isStringRecord(value.message.attributes)
    ? value.message.attributes
    : undefined;

  return {
    ok: true,
    envelope: {
      message: {
        data,
        ...(messageId === undefined ? {} : { messageId }),
        ...(publishTime === undefined ? {} : { publishTime }),
        ...(attributes === undefined ? {} : { attributes }),
      },
      subscription,
    },
    logEntry: decoded as unknown as LogEntry,
    ...(messageId === undefined ? {} : { messageId }),
    ...(publishTime === undefined ? {} : { publishTime }),
  };
}

export function classifyLogEntry(
  value: unknown,
  config: PresentationConfig,
): ClassificationResult {
  if (config.sourceEnvironment !== SOURCE_ENVIRONMENT) {
    return { kind: 'ignore', reason: 'wrong_environment' };
  }
  if (!isRecord(value)) return { kind: 'ignore', reason: 'wrong_payload' };
  if (value.logName !== stdoutLogName(config.gcpProjectId)) {
    return { kind: 'ignore', reason: 'wrong_log_name' };
  }
  if (value.severity !== 'ERROR') return { kind: 'ignore', reason: 'wrong_severity' };
  if (value.resource === null || !isRecord(value.resource)) {
    return { kind: 'ignore', reason: 'wrong_resource' };
  }
  if (value.resource.type !== 'cloud_run_revision') {
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
  const environment = payload.environment ?? payload.env;
  if (environment !== config.sourceEnvironment) {
    return { kind: 'ignore', reason: 'wrong_environment' };
  }
  if (payload.service !== config.sourceApiService) {
    return { kind: 'ignore', reason: 'wrong_service' };
  }
  if (payload.level !== 50) return { kind: 'ignore', reason: 'wrong_level' };
  if (payload.alertEligible !== true) {
    return { kind: 'ignore', reason: 'not_alert_eligible' };
  }

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

  const revision = safeRevision(value.resource.labels.revision_name);
  const appCode = safeAppCode(payload.appCode ?? payload.code);
  const method = safeMethod(payload.method);
  const route = safeRoute(payload.route);
  const timestamp = safeTimestamp(value.timestamp);
  const event = isKnownEvent(rawEvent) ? rawEvent : 'unknown_error';

  return {
    kind: 'match',
    entry: {
      ...(timestamp === undefined ? {} : { timestamp }),
      ...(revision === undefined ? {} : { revision }),
      errorId,
      event,
      ...(appCode === undefined ? {} : { appCode }),
      ...(statusCode === undefined ? {} : { statusCode }),
      ...(method === undefined ? {} : { method }),
      ...(route === undefined ? {} : { route }),
      service: config.sourceApiService,
      environment: 'production',
      logName: value.logName,
      projectId: config.gcpProjectId,
    },
  };
}

export function stdoutLogName(projectId: string): string {
  return `projects/${projectId}/logs/run.googleapis.com%2Fstdout`;
}

/** Create the application DTO only after the Cloud Logging source checks pass. */
export function toAlert(entry: ClassifiedLogEntry, projectId: string): Alert {
  const source: SourceReference = {
    label: 'Logs',
    href: loggingLink(projectId, entry.errorId),
  };
  return {
    ...(entry.timestamp === undefined ? {} : { timestamp: entry.timestamp }),
    ...(entry.revision === undefined ? {} : { revision: entry.revision }),
    errorId: entry.errorId,
    event: entry.event,
    ...(entry.appCode === undefined ? {} : { appCode: entry.appCode }),
    ...(entry.statusCode === undefined ? {} : { statusCode: entry.statusCode }),
    ...(entry.method === undefined ? {} : { method: entry.method }),
    ...(entry.route === undefined ? {} : { route: entry.route }),
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

function safeRevision(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)
    ? value
    : undefined;
}

function safeAppCode(value: unknown): 'Z006' | 'Z500' | undefined {
  return value === 'Z006' || value === 'Z500' ? value : undefined;
}

function safeMethod(value: unknown): HttpMethod | undefined {
  return value === 'GET' ||
    value === 'POST' ||
    value === 'PUT' ||
    value === 'PATCH' ||
    value === 'DELETE' ||
    value === 'HEAD' ||
    value === 'OPTIONS'
    ? value
    : undefined;
}

function safeRoute(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 256 ? value : undefined;
}

function safeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function isKnownEvent(value: string): value is KnownEvent {
  return (KNOWN_EVENTS as readonly string[]).includes(value);
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

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
