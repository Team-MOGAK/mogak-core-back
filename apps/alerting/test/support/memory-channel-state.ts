import { randomUUID } from 'node:crypto';

import { LEASE_TTL_MS, MAX_RATE_LIMIT_MS } from '../../src/infrastructure/config.js';
import {
  type ChannelStateDocument,
  type ChannelStateStore,
  type ChannelLease,
  type ClaimResult,
  type FencedWriteResult,
  ChannelStateError,
  validateState,
} from '../../src/infrastructure/channelState.js';

export class InMemoryChannelStateStore implements ChannelStateStore {
  private queue = Promise.resolve();

  constructor(
    private state: ChannelStateDocument,
    private readonly expectedSecretVersion: number,
    private readonly leaseTtlMs = LEASE_TTL_MS,
  ) {}

  claim(now: number): Promise<ClaimResult> {
    return this.serial(() => {
      const state = this.checkedState();
      if (state.disabled) return { kind: 'disabled' };
      if (state.nextAllowedAt > now) {
        return { kind: 'cooldown', nextAllowedAt: state.nextAllowedAt };
      }
      if (state.leaseToken !== null && state.leaseExpiresAt > now) {
        return { kind: 'busy', leaseExpiresAt: state.leaseExpiresAt };
      }
      const token = randomUUID();
      const leaseExpiresAt = now + this.leaseTtlMs;
      this.state = { ...state, leaseToken: token, leaseExpiresAt };
      return {
        kind: 'claimed',
        lease: { token, leaseExpiresAt, secretVersion: this.expectedSecretVersion },
      };
    });
  }

  release(lease: ChannelLease): Promise<FencedWriteResult> {
    return this.serial(() => {
      const state = this.checkedState();
      if (!ownsLease(state, lease)) return 'stale';
      this.state = { ...state, leaseToken: null, leaseExpiresAt: 0 };
      return 'fenced';
    });
  }

  recordRateLimit(
    lease: ChannelLease,
    nextAllowedAt: number,
    now = Date.now(),
  ): Promise<FencedWriteResult> {
    return this.serial(() => {
      assertEpoch(nextAllowedAt);
      assertEpoch(now);
      if (nextAllowedAt - now > MAX_RATE_LIMIT_MS) {
        throw new ChannelStateError('invalid_state', 'Rate limit duration is too long');
      }
      const state = this.checkedState();
      const fenced = ownsLease(state, lease);
      this.state = {
        ...state,
        nextAllowedAt: Math.max(state.nextAllowedAt, nextAllowedAt),
        ...(fenced ? { leaseToken: null, leaseExpiresAt: 0 } : {}),
      };
      return fenced ? 'fenced' : 'stale';
    });
  }

  disable(lease: ChannelLease): Promise<FencedWriteResult> {
    return this.serial(() => {
      const state = this.checkedState();
      if (!ownsLease(state, lease)) return 'stale';
      this.state = { ...state, disabled: true, leaseToken: null, leaseExpiresAt: 0 };
      return 'fenced';
    });
  }

  snapshot(): ChannelStateDocument {
    return this.checkedState();
  }

  private checkedState(): ChannelStateDocument {
    return validateState(this.state, this.expectedSecretVersion);
  }

  private serial<T>(operation: () => T): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

function ownsLease(state: ChannelStateDocument, lease: ChannelLease): boolean {
  return (
    lease.secretVersion === state.secretVersion &&
    state.leaseToken === lease.token &&
    state.leaseExpiresAt === lease.leaseExpiresAt
  );
}

function assertEpoch(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ChannelStateError('invalid_state', 'Invalid epoch time');
  }
}
