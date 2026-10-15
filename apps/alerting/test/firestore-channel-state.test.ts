import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  ChannelStateError,
  FirestoreChannelStateStore,
  type ChannelStateDocument,
  type DocumentReferenceLike,
  type DocumentSnapshotLike,
  type FirestoreLike,
  type TransactionLike,
} from '../src/infrastructure/channelState.js';
import type { RelayConfig } from '../src/config.js';
import { stdoutLogName } from '../src/presentation/input.js';
import { processPushBody } from '../src/presentation/handler.js';
import { MemoryQuarantinePublisher } from './support/memory-quarantine.js';

const CONFIG: RelayConfig = {
  gcpProjectId: 'test-project',
  sourceApiService: 'test-api',
  expectedSubscription: 'projects/test-project/subscriptions/test-subscription',
  quarantineTopic: 'projects/test-project/topics/test-quarantine',
  firestoreDatabaseId: 'relay-state',
  channelDocumentPath: 'alertChannels/production-discord',
  secretVersion: 2,
  discordWebhookUrl: 'https://discord.com/api/webhooks/123/token',
  port: 8080,
  sourceEnvironment: 'production',
  relayServiceName: 'test-relay',
};

function initialState(overrides: Partial<ChannelStateDocument> = {}): ChannelStateDocument {
  return {
    schemaVersion: 1,
    secretVersion: CONFIG.secretVersion,
    disabled: false,
    nextAllowedAt: 0,
    leaseToken: null,
    leaseExpiresAt: 0,
    ...overrides,
  };
}

class FakeFirestore implements FirestoreLike {
  private readonly reference: DocumentReferenceLike = { path: CONFIG.channelDocumentPath };
  private queue = Promise.resolve();
  private value: ChannelStateDocument | undefined;
  readonly attempts = { count: 0, committedWrites: 0 };
  retryNextTransaction = false;
  inTransaction = false;

  constructor(value: ChannelStateDocument | undefined) {
    this.value = value;
  }

  doc(): DocumentReferenceLike {
    return this.reference;
  }

  get state(): ChannelStateDocument | undefined {
    return this.value === undefined ? undefined : { ...this.value };
  }

  async runTransaction<T>(update: (transaction: TransactionLike) => Promise<T>): Promise<T> {
    const next = this.queue.then(() => this.execute(update));
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async execute<T>(update: (transaction: TransactionLike) => Promise<T>): Promise<T> {
    const attempts = this.retryNextTransaction ? 2 : 1;
    this.retryNextTransaction = false;
    let result!: T;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const writes: Record<string, unknown> = {};
      const transaction: TransactionLike = {
        get: async (): Promise<DocumentSnapshotLike> => ({
          exists: this.value !== undefined,
          data: () => (this.value === undefined ? undefined : { ...this.value }),
        }),
        update: (_reference, data) => {
          Object.assign(writes, data);
        },
      };

      this.attempts.count += 1;
      this.inTransaction = true;
      try {
        result = await update(transaction);
      } finally {
        this.inTransaction = false;
      }
      if (attempt === attempts - 1 && Object.keys(writes).length > 0) {
        if (this.value === undefined) throw new Error('cannot update missing document');
        this.value = { ...this.value, ...writes } as ChannelStateDocument;
        this.attempts.committedWrites += 1;
      }
    }
    return result;
  }
}

function store(fake: FakeFirestore): FirestoreChannelStateStore {
  return new FirestoreChannelStateStore(CONFIG, fake);
}

function pushEnvelope(): string {
  const logEntry = {
    logName: stdoutLogName(CONFIG.gcpProjectId),
    severity: 'ERROR',
    timestamp: '2026-10-15T00:00:00.000Z',
    resource: {
      type: 'cloud_run_revision',
      labels: {
        project_id: CONFIG.gcpProjectId,
        service_name: CONFIG.sourceApiService,
        revision_name: 'test-api-00001',
      },
    },
    jsonPayload: {
      schemaVersion: 1,
      environment: 'production',
      service: CONFIG.sourceApiService,
      level: 50,
      alertEligible: true,
      errorId: randomUUID(),
      event: 'http_request_failed',
      statusCode: 500,
      method: 'GET',
      route: '/health/ready',
    },
  };
  return JSON.stringify({
    subscription: CONFIG.expectedSubscription,
    message: { data: Buffer.from(JSON.stringify(logEntry)).toString('base64') },
  });
}

test('Firestore adapter fails closed for missing, invalid, and mismatched state', async () => {
  const missing = store(new FakeFirestore(undefined));
  await assert.rejects(
    () => missing.claim(1_000),
    (error: unknown) => error instanceof ChannelStateError && error.reason === 'missing_state',
  );

  const invalid = store(new FakeFirestore(initialState({ leaseToken: null, leaseExpiresAt: 1 })));
  await assert.rejects(
    () => invalid.claim(1_000),
    (error: unknown) => error instanceof ChannelStateError && error.reason === 'invalid_state',
  );

  const mismatched = store(
    new FakeFirestore(initialState({ secretVersion: CONFIG.secretVersion + 1 })),
  );
  await assert.rejects(
    () => mismatched.claim(1_000),
    (error: unknown) =>
      error instanceof ChannelStateError && error.reason === 'secret_version_mismatch',
  );
});

test('Firestore adapter claims and releases with a fenced finalization', async () => {
  const fake = new FakeFirestore(initialState());
  const channel = store(fake);
  const claimed = await channel.claim(1_000);
  assert.equal(claimed.kind, 'claimed');
  if (claimed.kind !== 'claimed') return;
  assert.equal(fake.state?.leaseToken, claimed.lease.token);

  assert.equal(await channel.release(claimed.lease), 'fenced');
  assert.equal(fake.state?.leaseToken, null);
  assert.equal(fake.state?.leaseExpiresAt, 0);
});

test('stale 429 updates cooldown monotonically without clearing a newer lease', async () => {
  const fake = new FakeFirestore(initialState());
  const firstStore = store(fake);
  const secondStore = store(fake);
  const first = await firstStore.claim(1_000);
  assert.equal(first.kind, 'claimed');
  if (first.kind !== 'claimed') return;

  assert.equal(await firstStore.recordRateLimit(first.lease, 5_000, 1_000), 'fenced');
  const second = await secondStore.claim(5_001);
  assert.equal(second.kind, 'claimed');
  if (second.kind !== 'claimed') return;

  assert.equal(await firstStore.recordRateLimit(first.lease, 8_000, 5_001), 'stale');
  assert.equal(await firstStore.release(first.lease), 'stale');
  assert.equal(fake.state?.nextAllowedAt, 8_000);
  assert.equal(fake.state?.leaseToken, second.lease.token);
});

test('two adapter instances share cooldown and serialize concurrent claims', async () => {
  const fake = new FakeFirestore(initialState());
  const firstStore = store(fake);
  const secondStore = store(fake);
  const first = await firstStore.claim(1_000);
  assert.equal(first.kind, 'claimed');
  if (first.kind !== 'claimed') return;
  await firstStore.recordRateLimit(first.lease, 5_000, 1_000);

  const beforeCooldown = await secondStore.claim(4_999);
  assert.deepEqual(beforeCooldown, { kind: 'cooldown', nextAllowedAt: 5_000 });
  const [left, right] = await Promise.all([firstStore.claim(5_001), secondStore.claim(5_001)]);
  assert.equal([left, right].filter((item) => item.kind === 'claimed').length, 1);
  assert.equal([left, right].filter((item) => item.kind === 'busy').length, 1);
});

test('transaction callback retries do not commit the discarded attempt', async () => {
  const fake = new FakeFirestore(initialState());
  fake.retryNextTransaction = true;
  const claimed = await store(fake).claim(1_000);
  assert.equal(claimed.kind, 'claimed');
  assert.equal(fake.attempts.count, 2);
  assert.equal(fake.attempts.committedWrites, 1);
  if (claimed.kind === 'claimed') assert.equal(fake.state?.leaseToken, claimed.lease.token);
});

test('handler sends Discord outside the Firestore transaction', async () => {
  const fake = new FakeFirestore(initialState());
  const channel = store(fake);
  let calls = 0;
  const discord = {
    send: async () => {
      assert.equal(fake.inTransaction, false);
      calls += 1;
      return { kind: 'success' as const, status: 200, messageId: '123456789012345678' };
    },
  };
  const outcome = await processPushBody(pushEnvelope(), {
    config: CONFIG,
    state: channel,
    sender: discord,
    quarantine: new MemoryQuarantinePublisher(),
    clock: () => 1_000,
  });
  assert.equal(outcome.statusCode, 204);
  assert.equal(calls, 1);
  assert.equal(fake.state?.leaseToken, null);
});

test('handler returns non-ack when a stale owner loses finalization fencing', async () => {
  const fake = new FakeFirestore(initialState());
  const firstStore = store(fake);
  const rivalStore = store(fake);
  let now = 1_000;
  let calls = 0;
  const discord = {
    send: async () => {
      calls += 1;
      now = 31_001;
      const rival = await rivalStore.claim(now);
      assert.equal(rival.kind, 'claimed');
      return { kind: 'success' as const, status: 200, messageId: '123456789012345678' };
    },
  };
  const outcome = await processPushBody(pushEnvelope(), {
    config: CONFIG,
    state: firstStore,
    sender: discord,
    quarantine: new MemoryQuarantinePublisher(),
    clock: () => now,
  });
  assert.equal(calls, 1);
  assert.equal(outcome.statusCode, 503);
  assert.equal(outcome.acknowledged, false);
});
