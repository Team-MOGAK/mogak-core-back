import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  MAX_HTTP_BODY_BYTES,
  RATE_LIMIT_FALLBACK_MS,
  REQUEST_BUDGET_MS,
  type RelayConfig,
} from './config.js';
import {
  classifyLogEntry,
  parsePushEnvelope,
  type ClassificationIgnoreReason,
} from './contracts.js';
import type { ChannelLease, ChannelStateStore } from './channelState.js';
import type { DiscordClient, DiscordSendResult } from './discordClient.js';
import { buildDiscordPayload } from './message.js';
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

  const now = clock();
  if (now >= deadline) return transient('request_deadline_before_claim');

  let claim;
  try {
    claim = await dependencies.stateStore.claim(now);
  } catch {
    dependencies.logger?.error?.(
      { event: 'channel_state_claim_failed' },
      'Channel state claim failed',
    );
    return transient('state_claim_failed');
  }

  if (claim.kind === 'disabled') return transient('channel_disabled');
  if (claim.kind === 'cooldown') return transient('channel_cooldown');
  if (claim.kind === 'busy') return transient('channel_lease_busy');

  const lease = claim.lease;
  const beforeSend = clock();
  if (beforeSend >= deadline || beforeSend >= lease.leaseExpiresAt) {
    await releaseQuietly(dependencies, lease);
    return transient('request_deadline_before_discord');
  }

  let discordResult: DiscordSendResult;
  try {
    discordResult = await dependencies.discordClient.send(
      buildDiscordPayload(classified.entry, dependencies.config),
      { deadline },
    );
  } catch {
    discordResult = { kind: 'transient_failure', reason: 'network' };
  }

  return handleDiscordResult(discordResult, classified.entry, lease, dependencies);
}

export const handlePush = processPushBody;

async function handleDiscordResult(
  result: DiscordSendResult,
  entry: Parameters<typeof buildDiscordPayload>[0],
  lease: ChannelLease,
  dependencies: RelayDependencies,
): Promise<RelayOutcome> {
  switch (result.kind) {
    case 'success': {
      try {
        const finalized = await dependencies.stateStore.release(lease);
        if (finalized === 'stale') return transient('stale_lease_on_success');
      } catch {
        dependencies.logger?.error?.(
          { event: 'channel_state_release_failed' },
          'Channel state release failed',
        );
        return transient('state_release_failed');
      }
      dependencies.logger?.info?.(
        {
          event: 'discord_delivery_succeeded',
          status: result.status,
          messageId: result.messageId,
          errorId: entry.errorId,
        },
        'Discord delivery succeeded',
      );
      return acknowledged('delivered');
    }
    case 'rate_limited': {
      const retryAfter = boundedRetryAfter(result.retryAfterMs);
      const receivedAt = dependencies.clock?.() ?? Date.now();
      const nextAllowedAt = receivedAt + retryAfter;
      try {
        await dependencies.stateStore.recordRateLimit(lease, nextAllowedAt, receivedAt);
      } catch {
        dependencies.logger?.error?.(
          { event: 'channel_state_rate_limit_failed' },
          'Channel state rate limit update failed',
        );
        return transient('state_rate_limit_failed');
      }
      return transient('discord_rate_limited');
    }
    case 'transient_failure': {
      try {
        await dependencies.stateStore.release(lease);
      } catch {
        dependencies.logger?.error?.(
          { event: 'channel_state_release_failed' },
          'Channel state release failed',
        );
        return transient('state_release_failed');
      }
      return transient(`discord_${result.reason}`);
    }
    case 'permanent_failure': {
      const reason: QuarantineReason = result.disableChannel
        ? 'discord_channel_disabled'
        : 'discord_payload_rejected';
      try {
        await dependencies.quarantine.publish(
          createQuarantineRecord(reason, dependencies.config, entry),
        );
      } catch {
        dependencies.logger?.error?.(
          { event: 'quarantine_publish_failed' },
          'Quarantine publish failed',
        );
        return transient('quarantine_failed');
      }

      try {
        const finalized = result.disableChannel
          ? await dependencies.stateStore.disable(lease)
          : await dependencies.stateStore.release(lease);
        if (finalized === 'stale') return transient('stale_lease_on_finalize');
      } catch {
        dependencies.logger?.error?.(
          { event: 'channel_state_finalize_failed' },
          'Channel state finalize failed',
        );
        return transient('state_finalize_failed');
      }
      return acknowledged(result.disableChannel ? 'channel_disabled' : 'discord_payload_rejected');
    }
  }
}

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

function boundedRetryAfter(value: number): number {
  return Number.isFinite(value) && value > 0 && value <= 24 * 60 * 60 * 1_000
    ? value
    : RATE_LIMIT_FALLBACK_MS;
}

async function releaseQuietly(dependencies: RelayDependencies, lease: ChannelLease): Promise<void> {
  try {
    await dependencies.stateStore.release(lease);
  } catch {
    dependencies.logger?.error?.(
      { event: 'channel_state_release_failed' },
      'Channel state release failed',
    );
  }
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
