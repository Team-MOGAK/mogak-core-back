import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  type ChannelStateDocument,
  type ChannelStateStore,
} from '../src/infrastructure/channelState.js';
import { InMemoryChannelStateStore } from './support/memory-channel-state.js';
import {
  MAX_HTTP_BODY_BYTES,
  MAX_PUBSUB_DATA_BYTES,
} from '../src/presentation/constants.js';
import type { RelayConfig } from '../src/config.js';
import { validateDiscordWebhookUrl } from '../src/infrastructure/config.js';
import type { AlertSummary } from '../src/application/contracts.js';
import { parsePushEnvelope, stdoutLogName } from '../src/presentation/input.js';
import { DiscordClient } from '../src/infrastructure/discordClient.js';
import { buildDiscordPayload, type DiscordPayload } from '../src/infrastructure/discord.js';
import { processPushBody, type RelayDependencies } from '../src/presentation/handler.js';
import { MemoryQuarantinePublisher } from './support/memory-quarantine.js';

const CONFIG: RelayConfig = {
  gcpProjectId: 'mogak-project',
  sourceApiService: 'mogak-api-production',
  expectedSubscription: 'projects/mogak-project/subscriptions/error-relay',
  quarantineTopic: 'projects/mogak-project/topics/error-relay-quarantine',
  firestoreDatabaseId: '(default)',
  channelDocumentPath: 'alertChannels/production-discord',
  secretVersion: 7,
  discordWebhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijk',
  port: 8080,
  sourceEnvironment: 'production',
  relayServiceName: 'error-log-relay',
};

class FakeDiscord {
  readonly calls: DiscordPayload[] = [];
  result: Awaited<ReturnType<RelayDependencies['sender']['send']>> = {
    kind: 'success',
    status: 204,
    messageId: '123456789012345678',
  };

  async send(summary: AlertSummary): Promise<typeof this.result> {
    const payload = buildDiscordPayload(summary);
    this.calls.push(payload);
    return this.result;
  }
}

function state(overrides: Partial<ChannelStateDocument> = {}): ChannelStateDocument {
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

function envelope(log = validLog()): string {
  return JSON.stringify({
    subscription: CONFIG.expectedSubscription,
    message: {
      messageId: 'message-1',
      publishTime: '2026-10-15T00:00:00.000Z',
      data: Buffer.from(JSON.stringify(log)).toString('base64'),
    },
  });
}

function validLog(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    logName: stdoutLogName(CONFIG.gcpProjectId),
    severity: 'ERROR',
    timestamp: '2026-10-15T00:00:00.000Z',
    resource: {
      type: 'cloud_run_revision',
      labels: {
        project_id: CONFIG.gcpProjectId,
        service_name: CONFIG.sourceApiService,
        revision_name: 'mogak-api-00001-abc',
      },
    },
    jsonPayload: {
      schemaVersion: 1,
      environment: 'production',
      service: CONFIG.sourceApiService,
      level: 50,
      alertEligible: true,
      errorId: randomUUID(),
      event: 'domain_exception',
      statusCode: 503,
      code: 'Z006',
      method: 'GET',
      route: '/health/ready',
      message: 'SENSITIVE_RAW_MESSAGE',
      stack: 'SENSITIVE_STACK',
      cause: 'SENSITIVE_CAUSE',
      request: { path: '/api/users/123?secret=SENSITIVE_QUERY' },
    },
    ...overrides,
  };
}

function dependencies(
  discord: FakeDiscord,
  store: ChannelStateStore = new InMemoryChannelStateStore(state(), CONFIG.secretVersion),
  quarantine = new MemoryQuarantinePublisher(),
  now = 1_000,
): RelayDependencies {
  return {
    config: CONFIG,
    state: store,
    sender: discord,
    quarantine,
    clock: () => now,
  };
}

test('filters wrong source, warn, fatal, and malformed payloads without Discord HTTP', async () => {
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const store = new InMemoryChannelStateStore(state(), CONFIG.secretVersion);
  const deps = dependencies(discord, store, quarantine);

  const wrongSource = validLog({
    resource: {
      type: 'cloud_run_revision',
      labels: { project_id: CONFIG.gcpProjectId, service_name: 'other-service' },
    },
  });
  const warning = validLog({ severity: 'WARNING' });
  const fatal = validLog({ severity: 'CRITICAL' });

  assert.equal((await processPushBody(envelope(wrongSource), deps)).statusCode, 204);
  assert.equal((await processPushBody(envelope(warning), deps)).statusCode, 204);
  assert.equal((await processPushBody(envelope(fatal), deps)).statusCode, 204);
  assert.equal((await processPushBody('{malformed', deps)).statusCode, 204);
  assert.equal(discord.calls.length, 0);
  assert.equal(quarantine.records.length, 1);
  assert.equal(quarantine.records[0]?.reason, 'malformed_envelope');
});

test('missing schema is quarantined without raw payload or Discord HTTP', async () => {
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const result = await processPushBody(
    envelope(
      validLog({ jsonPayload: { ...(validLog().jsonPayload as object), schemaVersion: 2 } }),
    ),
    dependencies(discord, undefined, quarantine),
  );

  assert.equal(result.statusCode, 204);
  assert.equal(discord.calls.length, 0);
  assert.equal(quarantine.records[0]?.reason, 'invalid_log_entry');
  assert.equal(JSON.stringify(quarantine.records).includes('SENSITIVE'), false);
});

test('state cooldown, disabled, mismatch, and store failure never call Discord', async () => {
  const discord = new FakeDiscord();
  const cooldown = new InMemoryChannelStateStore(
    state({ nextAllowedAt: 2_000 }),
    CONFIG.secretVersion,
  );
  assert.equal(
    (await processPushBody(envelope(), dependencies(discord, cooldown))).statusCode,
    503,
  );
  assert.equal(discord.calls.length, 0);

  const disabled = new InMemoryChannelStateStore(state({ disabled: true }), CONFIG.secretVersion);
  assert.equal(
    (await processPushBody(envelope(), dependencies(discord, disabled))).statusCode,
    503,
  );
  assert.equal(discord.calls.length, 0);

  const mismatch = new InMemoryChannelStateStore(state({ secretVersion: 6 }), CONFIG.secretVersion);
  assert.equal(
    (await processPushBody(envelope(), dependencies(discord, mismatch))).statusCode,
    503,
  );
  assert.equal(discord.calls.length, 0);

  const failedStore: ChannelStateStore = {
    claim: async () => {
      throw new Error('store down');
    },
    release: async () => 'fenced',
    recordRateLimit: async () => 'fenced',
    disable: async () => 'fenced',
  };
  assert.equal(
    (await processPushBody(envelope(), dependencies(discord, failedStore))).statusCode,
    503,
  );
  assert.equal(discord.calls.length, 0);
});

test('successful delivery finalizes the lease and sends only an allowlisted payload', async () => {
  const discord = new FakeDiscord();
  const result = await processPushBody(envelope(), dependencies(discord));
  assert.equal(result.statusCode, 204);
  assert.equal(discord.calls.length, 1);
  const payload = discord.calls[0];
  assert.ok(payload);
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.equal(payload.content.includes('SENSITIVE_RAW_MESSAGE'), false);
  assert.equal(payload.content.includes('SENSITIVE_STACK'), false);
  assert.equal(payload.content.includes('SENSITIVE_CAUSE'), false);
  assert.equal(payload.content.includes('/api/users/123'), false);
  assert.equal(payload.content.includes('SENSITIVE_QUERY'), false);
  assert.ok(payload.content.includes('/health/ready'));
  assert.ok(payload.content.length <= 1_800);
});

test('successful delivery logs only safe correlation fields', async () => {
  const discord = new FakeDiscord();
  const errorId = '123e4567-e89b-12d3-a456-426614174000';
  const log = validLog({
    jsonPayload: { ...(validLog().jsonPayload as object), errorId },
  });
  const infoLogs: Record<string, unknown>[] = [];
  const result = await processPushBody(envelope(log), {
    ...dependencies(discord),
    logger: {
      info: (object) => infoLogs.push(object),
    },
  });

  assert.equal(result.statusCode, 204);
  assert.deepEqual(infoLogs, [
    {
      event: 'discord_delivery_succeeded',
      status: 204,
      messageId: '123456789012345678',
      errorId,
    },
  ]);
  assert.equal(JSON.stringify(infoLogs).includes('SENSITIVE'), false);
  assert.equal(JSON.stringify(infoLogs).includes(CONFIG.discordWebhookUrl), false);
});

test('429 persists cooldown across handler recreation and concurrent calls', async () => {
  const store = new InMemoryChannelStateStore(state(), CONFIG.secretVersion);
  let now = 1_000;
  const firstDiscord = new FakeDiscord();
  firstDiscord.result = {
    kind: 'rate_limited',
    status: 429,
    retryAfterMs: 4_000,
  };
  const first = await processPushBody(
    envelope(),
    dependencies(firstDiscord, store, undefined, now),
  );
  assert.equal(first.statusCode, 503);

  now = 2_000;
  const recreatedDiscord = new FakeDiscord();
  const recreated = await processPushBody(
    envelope(),
    dependencies(recreatedDiscord, store, undefined, now),
  );
  assert.equal(recreated.statusCode, 503);
  assert.equal(recreatedDiscord.calls.length, 0);

  now = 10_000;
  const left = new FakeDiscord();
  const right = new FakeDiscord();
  const concurrent = await Promise.all([
    processPushBody(envelope(), dependencies(left, store, undefined, now)),
    processPushBody(envelope(), dependencies(right, store, undefined, now)),
  ]);
  assert.equal(concurrent.filter((item) => item.statusCode === 204).length, 1);
  assert.equal(left.calls.length + right.calls.length, 1);
});

test('later rate limits win and stale leases cannot clear a newer lease', async () => {
  const store = new InMemoryChannelStateStore(state(), CONFIG.secretVersion);
  const first = await store.claim(1_000);
  assert.equal(first.kind, 'claimed');
  if (first.kind !== 'claimed') return;
  await store.recordRateLimit(first.lease, 5_000);
  const second = await store.claim(5_001);
  assert.equal(second.kind, 'claimed');
  if (second.kind !== 'claimed') return;
  assert.equal(await store.recordRateLimit(first.lease, 8_000), 'stale');
  assert.equal(store.snapshot().nextAllowedAt, 8_000);
  assert.equal(store.snapshot().leaseToken, second.lease.token);
  assert.equal(await store.release(first.lease), 'stale');
  assert.equal(store.snapshot().leaseToken, second.lease.token);
});

test('5xx and timeout release the lease; permanent 4xx quarantines before ack', async () => {
  const serverFailure = new FakeDiscord();
  serverFailure.result = { kind: 'transient_failure', status: 503, reason: 'server' };
  const store = new InMemoryChannelStateStore(state(), CONFIG.secretVersion);
  assert.equal(
    (await processPushBody(envelope(), dependencies(serverFailure, store))).statusCode,
    503,
  );
  assert.equal(store.snapshot().leaseToken, null);

  const timeout = new FakeDiscord();
  timeout.result = { kind: 'transient_failure', reason: 'timeout' };
  assert.equal((await processPushBody(envelope(), dependencies(timeout, store))).statusCode, 503);
  assert.equal(store.snapshot().leaseToken, null);

  const invalidResponse = new FakeDiscord();
  invalidResponse.result = {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  };
  const invalidResponseStore = new InMemoryChannelStateStore(state(), CONFIG.secretVersion);
  const invalidResponseQuarantine = new MemoryQuarantinePublisher();
  const invalidResponseOutcome = await processPushBody(
    envelope(),
    dependencies(invalidResponse, invalidResponseStore, invalidResponseQuarantine),
  );
  assert.equal(invalidResponseOutcome.statusCode, 503);
  assert.equal(invalidResponseOutcome.acknowledged, false);
  assert.equal(invalidResponseStore.snapshot().leaseToken, null);
  assert.equal(invalidResponseQuarantine.records.length, 0);

  const permanent = new FakeDiscord();
  permanent.result = { kind: 'permanent_failure', status: 400, disableChannel: false };
  const quarantine = new MemoryQuarantinePublisher();
  assert.equal(
    (await processPushBody(envelope(), dependencies(permanent, store, quarantine))).statusCode,
    204,
  );
  assert.equal(quarantine.records[0]?.reason, 'discord_payload_rejected');
  assert.equal(store.snapshot().leaseToken, null);
});

test('quarantine failure is non-acknowledged and channel auth failures disable the channel', async () => {
  const permanent = new FakeDiscord();
  permanent.result = { kind: 'permanent_failure', status: 401, disableChannel: true };
  const quarantine = new MemoryQuarantinePublisher();
  quarantine.fail = true;
  const store = new InMemoryChannelStateStore(state(), CONFIG.secretVersion);
  assert.equal(
    (await processPushBody(envelope(), dependencies(permanent, store, quarantine))).statusCode,
    503,
  );
  assert.equal(store.snapshot().disabled, false);

  quarantine.fail = false;
  assert.equal(
    (await processPushBody(envelope(), dependencies(permanent, store, quarantine, 32_000)))
      .statusCode,
    204,
  );
  assert.equal(store.snapshot().disabled, true);
  assert.equal(permanent.calls.length, 2);
});

test('input limits and Discord webhook validation are enforced', async () => {
  const tooLargeData = Buffer.alloc(MAX_PUBSUB_DATA_BYTES + 1, 65).toString('base64');
  const parsed = parsePushEnvelope({
    subscription: CONFIG.expectedSubscription,
    message: { data: tooLargeData },
  });
  assert.equal(parsed.ok, false);

  assert.throws(() =>
    validateDiscordWebhookUrl('http://discord.com/api/webhooks/123456/abcdefghijk'),
  );
  assert.throws(() =>
    validateDiscordWebhookUrl('https://discordapp.com/api/webhooks/123456/abcdefghijk'),
  );
  assert.throws(() =>
    validateDiscordWebhookUrl('https://discord.com/api/webhooks/123456/abcdefghijk?wait=true'),
  );
  assert.equal(validateDiscordWebhookUrl(CONFIG.discordWebhookUrl), CONFIG.discordWebhookUrl);

  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const oversizedBody = 'x'.repeat(MAX_HTTP_BODY_BYTES + 1);
  const result = await processPushBody(oversizedBody, dependencies(discord, undefined, quarantine));
  assert.equal(result.statusCode, 204);
  assert.equal(discord.calls.length, 0);
  assert.equal(quarantine.records[0]?.reason, 'body_too_large');
});

test('Discord client handles success, rate limits, transient failures, timeouts, and permanent 4xx', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let response = new Response(JSON.stringify({ id: '123456789012345678' }), { status: 200 });
  const client = new DiscordClient(CONFIG.discordWebhookUrl, async (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    return response;
  });
  const payload: DiscordPayload = { content: 'safe', allowed_mentions: { parse: [] } };

  assert.deepEqual(await client.send(payload), {
    kind: 'success',
    status: 200,
    messageId: '123456789012345678',
  });
  assert.equal(new URL(requests[0]?.url ?? '').search, '?wait=true');
  assert.equal(requests[0]?.init.redirect, 'error');

  response = new Response(JSON.stringify({ retry_after: 3 }), {
    status: 429,
    headers: { 'retry-after': '2' },
  });
  assert.deepEqual(await client.send(payload), {
    kind: 'rate_limited',
    status: 429,
    retryAfterMs: 3_000,
  });

  response = new Response('not logged', { status: 503 });
  assert.deepEqual(await client.send(payload), {
    kind: 'transient_failure',
    status: 503,
    reason: 'server',
  });

  response = new Response('bad payload', { status: 400 });
  assert.deepEqual(await client.send(payload), {
    kind: 'permanent_failure',
    status: 400,
    disableChannel: false,
  });

  response = new Response('{}', { status: 200 });
  assert.deepEqual(await client.send(payload), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });

  response = new Response(JSON.stringify({ id: 'not-numeric' }), { status: 200 });
  assert.deepEqual(await client.send(payload), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });

  response = new Response(
    JSON.stringify({ id: '123456789012345678', extra: 'x'.repeat(64 * 1024) }),
    { status: 200 },
  );
  assert.deepEqual(await client.send(payload), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });

  let bodyCancelled = false;
  const oversizedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ id: '123456789012345678', extra: 'x'.repeat(64 * 1024) }),
        ),
      );
    },
    cancel() {
      bodyCancelled = true;
    },
  });
  response = new Response(oversizedBody, { status: 200 });
  assert.deepEqual(await client.send(payload), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });
  assert.equal(bodyCancelled, true);

  response = new Response(null, { status: 200 });
  assert.deepEqual(await client.send(payload), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });

  const timeoutClient = new DiscordClient(
    CONFIG.discordWebhookUrl,
    async (_input, init) => {
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          {
            once: true,
          },
        );
      });
      return new Response('unreachable', { status: 200 });
    },
    5,
  );
  assert.deepEqual(await timeoutClient.send(payload), {
    kind: 'transient_failure',
    reason: 'timeout',
  });
});
