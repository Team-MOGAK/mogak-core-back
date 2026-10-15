import { summarizeAlert, type Alert } from './contracts.js';
import {
  type ChannelLease,
  type DeliveryDependencies,
  type DeliveryOutcome,
  type DeliveryUseCase,
  type QuarantineReason,
  type SenderResult,
} from './ports.js';

const RATE_LIMIT_FALLBACK_MS = 60_000;
const MAX_RATE_LIMIT_MS = 24 * 60 * 60 * 1_000;

export function createDeliveryUseCase(dependencies: DeliveryDependencies): DeliveryUseCase {
  return {
    deliver: (alert, options = {}) => deliverAlert(alert, dependencies, options),
  };
}

export async function deliverAlert(
  alert: Alert,
  dependencies: DeliveryDependencies,
  options: { deadline?: number } = {},
): Promise<DeliveryOutcome> {
  const clock = dependencies.clock ?? Date.now;
  const deadline = options.deadline;
  const now = clock();
  if (deadline !== undefined && now >= deadline) {
    return transient('request_deadline_before_claim');
  }

  let claim;
  try {
    claim = await dependencies.state.claim(now);
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
  if (
    (deadline !== undefined && beforeSend >= deadline) ||
    beforeSend >= lease.leaseExpiresAt
  ) {
    await releaseQuietly(dependencies, lease);
    return transient('request_deadline_before_discord');
  }

  let senderResult: SenderResult;
  try {
    senderResult = await dependencies.sender.send(
      summarizeAlert(alert),
      deadline === undefined ? {} : { deadline },
    );
  } catch {
    senderResult = { kind: 'transient_failure', reason: 'network' };
  }

  return handleSenderResult(senderResult, alert, lease, dependencies);
}

async function handleSenderResult(
  result: SenderResult,
  alert: Alert,
  lease: ChannelLease,
  dependencies: DeliveryDependencies,
): Promise<DeliveryOutcome> {
  switch (result.kind) {
    case 'success': {
      try {
        const finalized = await dependencies.state.release(lease);
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
          errorId: alert.errorId,
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
        await dependencies.state.recordRateLimit(lease, nextAllowedAt, receivedAt);
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
        await dependencies.state.release(lease);
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
          createQuarantineRecord(reason, dependencies, alert),
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
          ? await dependencies.state.disable(lease)
          : await dependencies.state.release(lease);
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

function createQuarantineRecord(
  reason: QuarantineReason,
  dependencies: DeliveryDependencies,
  alert?: Pick<Alert, 'errorId' | 'statusCode' | 'appCode'>,
): {
  schemaVersion: 1;
  reason: QuarantineReason;
  sourceProjectId: string;
  sourceService: string;
  sourceEnvironment: 'production';
  receivedAt: string;
  errorId?: string;
  statusCode?: number;
  appCode?: 'Z006' | 'Z500';
} {
  const now = dependencies.clock?.() ?? Date.now();
  return {
    schemaVersion: 1,
    reason,
    sourceProjectId: dependencies.context.sourceProjectId,
    sourceService: dependencies.context.sourceService,
    sourceEnvironment: dependencies.context.sourceEnvironment,
    receivedAt: new Date(now).toISOString(),
    ...(alert?.errorId === undefined ? {} : { errorId: alert.errorId }),
    ...(alert?.statusCode === undefined ? {} : { statusCode: alert.statusCode }),
    ...(alert?.appCode === undefined ? {} : { appCode: alert.appCode }),
  };
}

function acknowledged(reason: string): DeliveryOutcome {
  return { acknowledged: true, reason };
}

function transient(reason: string): DeliveryOutcome {
  return { acknowledged: false, reason };
}

function boundedRetryAfter(value: number): number {
  return Number.isFinite(value) && value > 0 && value <= MAX_RATE_LIMIT_MS
    ? value
    : RATE_LIMIT_FALLBACK_MS;
}

async function releaseQuietly(
  dependencies: DeliveryDependencies,
  lease: ChannelLease,
): Promise<void> {
  try {
    await dependencies.state.release(lease);
  } catch {
    dependencies.logger?.error?.(
      { event: 'channel_state_release_failed' },
      'Channel state release failed',
    );
  }
}
