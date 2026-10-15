import type { IncomingMessage, ServerResponse } from 'node:http';

import { MAX_HTTP_BODY_BYTES, REQUEST_BUDGET_MS, type RelayConfig } from './config.js';
import {
  classifyLogEntry,
  parsePushEnvelope,
  type ClassificationIgnoreReason,
} from './contracts.js';
import type { ChannelStateStore } from './channelState.js';
import type { DiscordClient } from './discordClient.js';
import { createDeliveryUseCase } from './application/delivery.js';
import type { Alert, SourceReference } from './application/contracts.js';
import type { AlertLogger, DeliveryDependencies } from './application/ports.js';
import { buildDiscordPayload, loggingLink } from './message.js';
import {
  createQuarantineRecord,
  type QuarantinePublisher,
  type QuarantineReason,
} from './quarantine.js';

export type RelayLogger = Readonly<{
  info?(object: Record<string, unknown>, message?: string): void;
  warn?(object: Record<string, unknown>, message?: string): void;
  error?(object: Record<string, unknown>, message?: string): void;
}>;

export type RelayDependencies = Readonly<{
  config: RelayConfig;
  stateStore: ChannelStateStore;
  discordClient: Pick<DiscordClient, 'send'>;
  quarantine: QuarantinePublisher;
  clock?: () => number;
  requestBudgetMs?: number;
  logger?: RelayLogger;
}>;

export type RelayOutcome = Readonly<{
  statusCode: number;
  acknowledged: boolean;
  reason: string;
}>;

export function createRelayHandler(dependencies: RelayDependencies) {
  return async function relayHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    await handleRequest(req, res, dependencies);
  };
}

export const createHandler = createRelayHandler;

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: RelayDependencies,
): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end();
    return;
  }

  const clock = dependencies.clock ?? Date.now;
  const startedAt = clock();
  const deadline = startedAt + (dependencies.requestBudgetMs ?? REQUEST_BUDGET_MS);
  const body = await readBody(req, MAX_HTTP_BODY_BYTES, deadline);
  const outcome = body.deadlineExceeded
    ? transient('request_deadline_reading_body')
    : body.tooLarge
      ? await quarantineOutcome('body_too_large', dependencies)
      : await processPushBody(body.value, dependencies, { startedAt, deadline });
  res.statusCode = outcome.statusCode;
  res.end();
}

export async function processPushBody(
  value: string | Buffer | unknown,
  dependencies: RelayDependencies,
  options: { startedAt?: number; deadline?: number } = {},
): Promise<RelayOutcome> {
  const clock = dependencies.clock ?? Date.now;
  const startedAt = options.startedAt ?? clock();
  const deadline =
    options.deadline ?? startedAt + (dependencies.requestBudgetMs ?? REQUEST_BUDGET_MS);

  let envelope: unknown;
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.byteLength > MAX_HTTP_BODY_BYTES) {
      return quarantineOutcome('body_too_large', dependencies);
    }
    try {
      envelope = JSON.parse(bytes.toString('utf8'));
    } catch {
      return quarantineOutcome('malformed_envelope', dependencies);
    }
  } else {
    envelope = value;
  }

  const parsed = parsePushEnvelope(envelope, {
    expectedSubscription: dependencies.config.expectedSubscription,
  });
  if (!parsed.ok) {
    return quarantineOutcome('malformed_envelope', dependencies);
  }

  const classified = classifyLogEntry(parsed.logEntry, dependencies.config);
  if (classified.kind === 'ignore') {
    if (isMalformedClassification(classified.reason)) {
      return quarantineOutcome('invalid_log_entry', dependencies);
    }
    return acknowledged('filtered');
  }

  const alert = toAlert(classified.entry, dependencies.config);
  const outcome = await createDeliveryUseCase(createDeliveryDependencies(dependencies)).deliver(
    alert,
    { deadline },
  );
  return {
    statusCode: outcome.acknowledged ? 204 : 503,
    ...outcome,
  };
}

export const handlePush = processPushBody;

async function quarantineOutcome(
  reason: QuarantineReason,
  dependencies: RelayDependencies,
): Promise<RelayOutcome> {
  try {
    await dependencies.quarantine.publish(createQuarantineRecord(reason, dependencies.config));
    return acknowledged('quarantined');
  } catch {
    dependencies.logger?.error?.(
      { event: 'quarantine_publish_failed' },
      'Quarantine publish failed',
    );
    return transient('quarantine_failed');
  }
}

function acknowledged(reason: string): RelayOutcome {
  return { statusCode: 204, acknowledged: true, reason };
}

function transient(reason: string): RelayOutcome {
  return { statusCode: 503, acknowledged: false, reason };
}

function isMalformedClassification(reason: ClassificationIgnoreReason): boolean {
  return (
    reason === 'wrong_payload' ||
    reason === 'invalid_error_id' ||
    reason === 'invalid_event' ||
    reason === 'invalid_status_code'
  );
}

function toAlert(
  entry: {
    timestamp?: string;
    revision?: string;
    errorId: string;
    event: Alert['event'];
    appCode?: Alert['appCode'];
    statusCode?: number;
    method?: Alert['method'];
    route?: string;
    service: string;
    environment: 'production';
    projectId: string;
  },
  config: Pick<RelayConfig, 'gcpProjectId'>,
): Alert {
  const source: SourceReference = {
    label: 'Logs',
    href: loggingLink(config.gcpProjectId, entry.errorId),
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

function createDeliveryDependencies(
  dependencies: RelayDependencies,
): DeliveryDependencies {
  return {
    state: dependencies.stateStore,
    sender: {
      send: (summary, options) =>
        dependencies.discordClient.send(buildDiscordPayload(summary), options),
    },
    quarantine: dependencies.quarantine,
    context: {
      sourceProjectId: dependencies.config.gcpProjectId,
      sourceService: dependencies.config.sourceApiService,
      sourceEnvironment: dependencies.config.sourceEnvironment,
    },
    ...(dependencies.clock === undefined ? {} : { clock: dependencies.clock }),
    ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger as AlertLogger }),
  };
}

type ReadBodyResult =
  | Readonly<{ deadlineExceeded: false; tooLarge: true; value: undefined }>
  | Readonly<{ deadlineExceeded: false; tooLarge: false; value: Buffer }>
  | Readonly<{ deadlineExceeded: true; value: undefined; tooLarge: false }>;

async function readBody(
  req: IncomingMessage,
  limit: number,
  deadline: number,
): Promise<ReadBodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  let deadlineExceeded = false;
  const timeout = setTimeout(
    () => {
      deadlineExceeded = true;
      req.destroy();
    },
    Math.max(1, deadline - Date.now()),
  );
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > limit) {
        tooLarge = true;
        continue;
      }
      chunks.push(buffer);
    }
  } catch {
    if (deadlineExceeded) return { deadlineExceeded: true, value: undefined, tooLarge: false };
    throw new Error('request body read failed');
  } finally {
    clearTimeout(timeout);
  }
  if (deadlineExceeded) return { deadlineExceeded: true, value: undefined, tooLarge: false };
  return tooLarge
    ? { deadlineExceeded: false, tooLarge: true, value: undefined }
    : { deadlineExceeded: false, tooLarge: false, value: Buffer.concat(chunks, size) };
}
