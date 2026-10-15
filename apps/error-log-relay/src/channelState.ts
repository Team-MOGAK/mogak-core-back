import { randomUUID } from 'node:crypto';

import { LEASE_TTL_MS, MAX_RATE_LIMIT_MS, type RelayConfig } from './config.js';
import { isUuid } from './contracts.js';

export type ChannelStateDocument = Readonly<{
  schemaVersion: 1;
  secretVersion: number;
  disabled: boolean;
  nextAllowedAt: number;
  leaseToken: string | null;
  leaseExpiresAt: number;
}>;

export type ChannelLease = Readonly<{
  token: string;
  leaseExpiresAt: number;
  secretVersion: number;
}>;

export type ClaimResult =
  | Readonly<{ kind: 'claimed'; lease: ChannelLease }>
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'cooldown'; nextAllowedAt: number }>
  | Readonly<{ kind: 'busy'; leaseExpiresAt: number }>;

export type FencedWriteResult = 'fenced' | 'stale';

export interface ChannelStateStore {
  claim(now: number): Promise<ClaimResult>;
  release(lease: ChannelLease): Promise<FencedWriteResult>;
  recordRateLimit(
    lease: ChannelLease,
    nextAllowedAt: number,
    now?: number,
  ): Promise<FencedWriteResult>;
  disable(lease: ChannelLease): Promise<FencedWriteResult>;
}

export type DocumentReferenceLike = Readonly<Record<string, unknown>>;

export type DocumentSnapshotLike = Readonly<{
  exists: boolean;
  data(): unknown;
}>;

export type TransactionLike = {
  get(reference: DocumentReferenceLike): Promise<DocumentSnapshotLike>;
  update(reference: DocumentReferenceLike, data: Record<string, unknown>): unknown;
};

export type FirestoreLike = {
  doc(path: string): DocumentReferenceLike;
  runTransaction<T>(update: (transaction: TransactionLike) => Promise<T>): Promise<T>;
};

export class ChannelStateError extends Error {
  readonly reason: 'missing_state' | 'invalid_state' | 'secret_version_mismatch' | 'write_failed';

  constructor(reason: ChannelStateError['reason'], message = 'Channel state is unavailable') {
    super(message);
    this.name = 'ChannelStateError';
    this.reason = reason;
  }
}

export class FirestoreChannelStateStore implements ChannelStateStore {
  private readonly document: DocumentReferenceLike;

  constructor(
    private readonly config: Pick<RelayConfig, 'channelDocumentPath' | 'secretVersion'>,
    firestore: FirestoreLike,
    private readonly leaseTtlMs = LEASE_TTL_MS,
  ) {
    this.document = firestore.doc(config.channelDocumentPath);
    if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 0) {
      throw new ChannelStateError('invalid_state', 'Lease TTL must be positive');
    }
    this.firestore = firestore;
  }

  private readonly firestore: FirestoreLike;

  async claim(now: number): Promise<ClaimResult> {
    assertEpoch(now);
    return this.runTransaction(async (transaction) => {
      const state = await this.readState(transaction);
      if (state.disabled) return { kind: 'disabled' };
      if (state.nextAllowedAt > now) {
        return { kind: 'cooldown', nextAllowedAt: state.nextAllowedAt };
      }
      if (state.leaseToken !== null && state.leaseExpiresAt > now) {
        return { kind: 'busy', leaseExpiresAt: state.leaseExpiresAt };
      }

      const token = randomUUID();
      const leaseExpiresAt = now + this.leaseTtlMs;
      transaction.update(this.document, { leaseToken: token, leaseExpiresAt });
      return {
        kind: 'claimed',
        lease: { token, leaseExpiresAt, secretVersion: this.config.secretVersion },
      };
    });
  }

  async release(lease: ChannelLease): Promise<FencedWriteResult> {
    return this.runTransaction(async (transaction) => {
      const state = await this.readState(transaction);
      if (!ownsLease(state, lease)) return 'stale';
      transaction.update(this.document, { leaseToken: null, leaseExpiresAt: 0 });
      return 'fenced';
    });
  }

  async recordRateLimit(
    lease: ChannelLease,
    nextAllowedAt: number,
    now = Date.now(),
  ): Promise<FencedWriteResult> {
    assertEpoch(nextAllowedAt);
    assertEpoch(now);
    if (nextAllowedAt - now > MAX_RATE_LIMIT_MS) {
      throw new ChannelStateError('invalid_state', 'Rate limit duration is too long');
    }
    return this.runTransaction(async (transaction) => {
      const state = await this.readState(transaction);
      const next = Math.max(state.nextAllowedAt, nextAllowedAt);
      const update: Record<string, unknown> = { nextAllowedAt: next };
      if (ownsLease(state, lease)) {
        update.leaseToken = null;
        update.leaseExpiresAt = 0;
      }
      transaction.update(this.document, update);
      return ownsLease(state, lease) ? 'fenced' : 'stale';
    });
  }

  async disable(lease: ChannelLease): Promise<FencedWriteResult> {
    return this.runTransaction(async (transaction) => {
      const state = await this.readState(transaction);
      if (!ownsLease(state, lease)) return 'stale';
      transaction.update(this.document, {
        disabled: true,
        leaseToken: null,
        leaseExpiresAt: 0,
      });
      return 'fenced';
    });
  }

  private async readState(transaction: TransactionLike): Promise<ChannelStateDocument> {
    let snapshot: DocumentSnapshotLike;
    try {
      snapshot = await transaction.get(this.document);
    } catch (error) {
      throw new ChannelStateError('write_failed', safeErrorMessage(error));
    }
    if (!snapshot.exists) throw new ChannelStateError('missing_state');
    return validateState(snapshot.data(), this.config.secretVersion);
  }

  private async runTransaction<T>(
    operation: (transaction: TransactionLike) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.firestore.runTransaction(operation);
    } catch (error) {
      if (error instanceof ChannelStateError) throw error;
      throw new ChannelStateError('write_failed', safeErrorMessage(error));
    }
  }
}

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

export function validateState(value: unknown, expectedSecretVersion: number): ChannelStateDocument {
  if (!Number.isSafeInteger(expectedSecretVersion) || expectedSecretVersion <= 0) {
    throw new ChannelStateError('invalid_state', 'Secret version must be a positive integer');
  }
  if (!isRecord(value)) throw new ChannelStateError('invalid_state');
  const requiredKeys = [
    'disabled',
    'leaseExpiresAt',
    'leaseToken',
    'nextAllowedAt',
    'schemaVersion',
    'secretVersion',
  ];
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== requiredKeys.length ||
    actualKeys.some((key, index) => key !== requiredKeys[index])
  ) {
    throw new ChannelStateError('invalid_state');
  }
  if (value.schemaVersion !== 1) throw new ChannelStateError('invalid_state');
  if (value.secretVersion !== expectedSecretVersion) {
    throw new ChannelStateError('secret_version_mismatch');
  }
  if (typeof value.disabled !== 'boolean') throw new ChannelStateError('invalid_state');
  if (!isEpoch(value.nextAllowedAt) || !isEpoch(value.leaseExpiresAt)) {
    throw new ChannelStateError('invalid_state');
  }
  if (
    value.leaseToken !== null &&
    (typeof value.leaseToken !== 'string' || !isUuid(value.leaseToken))
  ) {
    throw new ChannelStateError('invalid_state');
  }
  if (value.leaseToken === null && value.leaseExpiresAt !== 0) {
    throw new ChannelStateError('invalid_state');
  }
  return {
    schemaVersion: 1,
    secretVersion: expectedSecretVersion,
    disabled: value.disabled,
    nextAllowedAt: value.nextAllowedAt,
    leaseToken: value.leaseToken,
    leaseExpiresAt: value.leaseExpiresAt,
  };
}

function ownsLease(state: ChannelStateDocument, lease: ChannelLease): boolean {
  return (
    lease.secretVersion === state.secretVersion &&
    state.leaseToken === lease.token &&
    state.leaseExpiresAt === lease.leaseExpiresAt
  );
}

function assertEpoch(value: number): void {
  if (!isEpoch(value)) throw new ChannelStateError('invalid_state', 'Invalid epoch time');
}

function isEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'Firestore operation failed';
}
