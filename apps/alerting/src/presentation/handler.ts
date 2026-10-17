import type { IncomingMessage, ServerResponse } from 'node:http';

import { MAX_HTTP_BODY_BYTES, REQUEST_BUDGET_MS } from './constants.js';
import type { PresentationConfig } from './types.js';
import {
  classifyLogEntry,
  parsePushEnvelope,
  toAlert,
  type ClassificationIgnoreReason,
} from './input.js';
import { createQuarantineRecord } from '../application/service/alertDelivery.service.js';
import type {
  AlertLogger,
  DeliveryOptions,
  DeliveryUseCase,
  QuarantinePort,
  QuarantineReason,
} from '../application/port/alertDelivery.port.js';

export type RelayDependencies = Readonly<{
  config: PresentationConfig;
  delivery: DeliveryUseCase;
  quarantine: QuarantinePort;
  clock?: () => number;
  requestBudgetMs?: number;
  logger?: AlertLogger;
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
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  const abortBeforeRequestComplete = () => {
    if (!req.complete) abortRequest();
  };
  const abortWhenResponseCloses = () => {
    if (!res.writableEnded && !res.writableFinished) abortRequest();
  };
  const budgetTimer = setTimeout(abortRequest, Math.max(1, deadline - clock()));
  req.once('aborted', abortRequest);
  req.once('close', abortBeforeRequestComplete);
  res.once('close', abortWhenResponseCloses);

  try {
    const body = await readBody(req, MAX_HTTP_BODY_BYTES, deadline, controller.signal, clock);
    const requestOptions: DeliveryOptions = { deadline, signal: controller.signal };
    const outcome = body.aborted
      ? transient('request_deadline_reading_body')
      : body.tooLarge
        ? await quarantineOutcome('body_too_large', dependencies, requestOptions)
        : await processPushBody(body.value, dependencies, {
            startedAt,
            ...requestOptions,
          });
    if (res.destroyed || res.writableEnded || res.writableFinished) {
      return;
    }
    res.statusCode = outcome.statusCode;
    res.end();
  } finally {
    clearTimeout(budgetTimer);
    req.removeListener('aborted', abortRequest);
    req.removeListener('close', abortBeforeRequestComplete);
    res.removeListener('close', abortWhenResponseCloses);
  }
}

export async function processPushBody(
  value: string | Buffer | unknown,
  dependencies: RelayDependencies,
  options: { startedAt?: number } & DeliveryOptions = {},
): Promise<RelayOutcome> {
  const clock = dependencies.clock ?? Date.now;
  const startedAt = options.startedAt ?? clock();
  const deadline =
    options.deadline ?? startedAt + (dependencies.requestBudgetMs ?? REQUEST_BUDGET_MS);
  const requestOptions: DeliveryOptions = {
    deadline,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };

  let envelope: unknown;
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.byteLength > MAX_HTTP_BODY_BYTES) {
      return quarantineOutcome('body_too_large', dependencies, requestOptions);
    }
    try {
      envelope = JSON.parse(bytes.toString('utf8'));
    } catch {
      return quarantineOutcome('malformed_envelope', dependencies, requestOptions);
    }
  } else {
    envelope = value;
  }

  const parsed = parsePushEnvelope(envelope, dependencies.config.expectedSubscription);
  if (!parsed.ok) {
    return quarantineOutcome('malformed_envelope', dependencies, requestOptions);
  }

  const classified = classifyLogEntry(parsed.logEntry, dependencies.config);
  if (classified.kind === 'ignore') {
    if (isMalformedClassification(classified.reason)) {
      return quarantineOutcome('invalid_log_entry', dependencies, requestOptions);
    }
    return acknowledged('filtered');
  }

  const outcome = await dependencies.delivery.deliver(toAlert(classified.entry), requestOptions);
  return {
    statusCode: outcome.acknowledged ? 204 : 503,
    ...outcome,
  };
}

async function quarantineOutcome(
  reason: QuarantineReason,
  dependencies: RelayDependencies,
  options: DeliveryOptions = {},
): Promise<RelayOutcome> {
  const clock = dependencies.clock ?? Date.now;
  if (requestUnavailable(options, clock())) {
    return transient('request_deadline_before_quarantine');
  }
  try {
    await dependencies.quarantine.publish(createQuarantineRecord(reason), options);
    if (requestUnavailable(options, clock())) {
      return transient('request_deadline_after_quarantine');
    }
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
    reason === 'invalid_timestamp' ||
    reason === 'invalid_error_id' ||
    reason === 'invalid_event' ||
    reason === 'invalid_status_code' ||
    reason === 'invalid_method'
  );
}

type ReadBodyResult =
  | Readonly<{ aborted: false; tooLarge: true; value: undefined }>
  | Readonly<{ aborted: false; tooLarge: false; value: Buffer }>
  | Readonly<{ aborted: true; value: undefined; tooLarge: false }>;

async function readBody(
  req: IncomingMessage,
  limit: number,
  deadline: number,
  signal: AbortSignal,
  clock: () => number,
): Promise<ReadBodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  const abortReading = () => req.destroy();
  if (signal.aborted) return { aborted: true, value: undefined, tooLarge: false };
  signal.addEventListener('abort', abortReading, { once: true });
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
    if (signal.aborted) return { aborted: true, value: undefined, tooLarge: false };
    throw new Error('request body read failed');
  } finally {
    signal.removeEventListener('abort', abortReading);
  }
  if (signal.aborted || clock() >= deadline) {
    return { aborted: true, value: undefined, tooLarge: false };
  }
  return tooLarge
    ? { aborted: false, tooLarge: true, value: undefined }
    : { aborted: false, tooLarge: false, value: Buffer.concat(chunks, size) };
}

function requestUnavailable(options: DeliveryOptions, now: number): boolean {
  return (
    options.signal?.aborted === true || (options.deadline !== undefined && now >= options.deadline)
  );
}
