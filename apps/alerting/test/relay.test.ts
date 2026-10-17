import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { createServer, request as httpRequest, type Server } from 'node:http';
import test from 'node:test';

import type { Alert, AlertSummary } from '../src/application/type/alert.type.js';
import { DeliveryService } from '../src/application/service/alertDelivery.service.js';
import type {
  AlertSender,
  DeliveryOptions,
  DeliveryUseCase,
} from '../src/application/port/alertDelivery.port.js';
import type { RelayConfig } from '../src/config.js';
import { loadConfig, RelayConfigError } from '../src/config.js';
import { validateDiscordWebhookUrl } from '../src/infrastructure/discord.policy.js';
import { buildDiscordPayload } from '../src/infrastructure/discord.js';
import { DiscordClient } from '../src/infrastructure/discordClient.js';
import {
  PubSubQuarantinePublisher,
  type PublisherClient,
} from '../src/infrastructure/quarantine.js';
import { start } from '../src/main.js';
import { MAX_HTTP_BODY_BYTES, MAX_PUBSUB_DATA_BYTES } from '../src/presentation/constants.js';
import { createRelayHandler, processPushBody } from '../src/presentation/handler.js';
import { parsePushEnvelope, stdoutLogName } from '../src/presentation/input.js';
import type { RelayDependencies } from '../src/presentation/handler.js';
import { MemoryQuarantinePublisher } from './support/memory-quarantine.js';

const CONFIG: RelayConfig = {
  gcpProjectId: 'mogak-project',
  sourceApiService: 'mogak-core-api',
  expectedSubscription: 'projects/mogak-project/subscriptions/error-relay',
  quarantineTopic: 'projects/mogak-project/topics/error-relay-quarantine',
  discordWebhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijk',
  port: 8080,
  sourceEnvironment: 'production',
  relayServiceName: 'error-log-relay',
};

class FakeDiscord implements AlertSender {
  readonly calls: AlertSummary[] = [];
  result: Awaited<ReturnType<AlertSender['send']>> = {
    kind: 'success',
    status: 204,
    messageId: '123456789012345678',
  };

  async send(summary: AlertSummary): Promise<typeof this.result> {
    this.calls.push(summary);
    return this.result;
  }
}

function summary(): AlertSummary {
  return {
    timestamp: '2026-10-15T00:00:00.000Z',
    errorId: randomUUID(),
    event: 'domain_exception',
    eventSummary: 'API domain failure',
    service: CONFIG.sourceApiService,
    environment: CONFIG.sourceEnvironment,
    source: { label: 'Logs', href: 'https://console.cloud.google.com/logs' },
  };
}

function alert(): Alert {
  return summary();
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
      environment: CONFIG.sourceEnvironment,
      service: CONFIG.sourceApiService,
      producer: 'mogak-core-api',
      level: 50,
      alertEligible: true,
      errorId: randomUUID(),
      event: 'domain_exception',
      statusCode: 503,
      code: 'Z006',
      method: 'GET',
      routeTemplate: '/health/ready',
      route: '/api/users/123?secret=SENSITIVE_QUERY',
      message: 'SENSITIVE_RAW_MESSAGE',
      stack: 'SENSITIVE_STACK',
      cause: 'SENSITIVE_CAUSE',
      request: { path: '/api/users/123?secret=SENSITIVE_QUERY' },
    },
    ...overrides,
  };
}

function dependencies(
  discord: AlertSender,
  quarantine = new MemoryQuarantinePublisher(),
  now = 1_000,
  logger?: RelayDependencies['logger'],
): RelayDependencies {
  const delivery: DeliveryUseCase = new DeliveryService(discord, quarantine, () => now, logger);
  return {
    config: CONFIG,
    delivery,
    quarantine,
    clock: () => now,
    ...(logger === undefined ? {} : { logger }),
  };
}

async function openRelayServer(deps: RelayDependencies): Promise<{ server: Server; port: number }> {
  const relayHandler = createRelayHandler(deps);
  const server = createServer((request, response) => {
    void relayHandler(request, response).catch(() => {
      if (!response.headersSent && !response.destroyed) response.statusCode = 503;
      if (!response.writableEnded && !response.destroyed) response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeRelayServer(server);
    throw new Error('test relay server did not expose a TCP address');
  }
  return { server, port: address.port };
}

async function closeRelayServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function sendRelayPost(port: number, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.once('error', reject);
    request.end(body);
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('test condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('filters wrong sources and non-error severities without Discord HTTP', async () => {
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const deps = dependencies(discord, quarantine);

  const wrongSource = validLog({
    resource: {
      type: 'cloud_run_revision',
      labels: { project_id: CONFIG.gcpProjectId, service_name: 'other-service' },
    },
  });
  const warning = validLog({ severity: 'WARNING' });
  const fatal = validLog({ severity: 'CRITICAL' });
  const wrongProducer = validLog({
    jsonPayload: { ...(validLog().jsonPayload as object), producer: 'other-producer' },
  });

  assert.equal((await processPushBody(envelope(wrongSource), deps)).statusCode, 204);
  assert.equal((await processPushBody(envelope(warning), deps)).statusCode, 204);
  assert.equal((await processPushBody(envelope(fatal), deps)).statusCode, 204);
  assert.equal((await processPushBody(envelope(wrongProducer), deps)).statusCode, 204);
  assert.equal((await processPushBody('{malformed', deps)).statusCode, 204);
  assert.equal(discord.calls.length, 0);
  assert.equal(quarantine.records.length, 1);
  assert.equal(quarantine.records[0]?.reason, 'malformed_envelope');
});

test('invalid schema and missing timestamp are quarantined without raw payload', async () => {
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const deps = dependencies(discord, quarantine);
  const invalidSchema = validLog({
    jsonPayload: { ...(validLog().jsonPayload as object), schemaVersion: 2 },
  });
  const missingTimestamp = validLog({ timestamp: undefined });

  assert.equal((await processPushBody(envelope(invalidSchema), deps)).statusCode, 204);
  assert.equal((await processPushBody(envelope(missingTimestamp), deps)).statusCode, 204);
  assert.equal(discord.calls.length, 0);
  assert.equal(quarantine.records.length, 2);
  assert.equal(
    quarantine.records.every((record) => record.reason === 'invalid_log_entry'),
    true,
  );
  assert.equal(JSON.stringify(quarantine.records).includes('SENSITIVE'), false);
});

test('delivers only allowlisted fields and derives app-code summary from shared metadata', async () => {
  const discord = new FakeDiscord();
  const result = await processPushBody(envelope(), dependencies(discord));
  assert.equal(result.statusCode, 204);
  assert.equal(discord.calls.length, 1);
  const summary = discord.calls[0];
  assert.ok(summary);
  assert.equal(summary.appCode, 'Z006');
  assert.equal(summary.appCodeSummary, '스토리지 기능이 비활성화되어 있습니다');
  assert.equal(summary.routeTemplate, '/health/ready');
  assert.equal('route' in summary, false);
  const payload = buildDiscordPayload(summary);
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.equal(payload.content.includes('SENSITIVE_RAW_MESSAGE'), false);
  assert.equal(payload.content.includes('SENSITIVE_STACK'), false);
  assert.equal(payload.content.includes('SENSITIVE_CAUSE'), false);
  assert.equal(payload.content.includes('/api/users/123'), false);
  assert.ok(payload.content.includes('/health/ready'));
});

test('delivery logging contains only safe correlation fields', async () => {
  const discord = new FakeDiscord();
  const logs: Record<string, unknown>[] = [];
  const result = await processPushBody(
    envelope(),
    dependencies(discord, new MemoryQuarantinePublisher(), 1_000, {
      info: (object) => logs.push(object),
    }),
  );
  assert.equal(result.statusCode, 204);
  assert.deepEqual(logs[0], {
    event: 'discord_delivery_succeeded',
    status: 204,
    messageId: '123456789012345678',
    errorId: discord.calls[0]?.errorId,
  });
  assert.equal(JSON.stringify(logs).includes('SENSITIVE'), false);
  assert.equal(JSON.stringify(logs).includes(CONFIG.discordWebhookUrl), false);
});

test('returns non-ack for rate limits and transient Discord failures', async () => {
  const discord = new FakeDiscord();
  discord.result = { kind: 'rate_limited', status: 429 };
  assert.equal((await processPushBody(envelope(), dependencies(discord))).statusCode, 503);

  discord.result = { kind: 'transient_failure', status: 503, reason: 'server' };
  assert.equal((await processPushBody(envelope(), dependencies(discord))).statusCode, 503);
});

test('quarantines permanent Discord rejection and retries when quarantine fails', async () => {
  const discord = new FakeDiscord();
  discord.result = { kind: 'permanent_failure', status: 401, reason: 'discord_webhook_rejected' };
  const quarantine = new MemoryQuarantinePublisher();
  assert.equal(
    (await processPushBody(envelope(), dependencies(discord, quarantine))).statusCode,
    204,
  );
  assert.equal(quarantine.records[0]?.reason, 'discord_webhook_rejected');

  quarantine.fail = true;
  assert.equal(
    (await processPushBody(envelope(), dependencies(discord, quarantine))).statusCode,
    503,
  );
});

test('webhook rejection emits only safe error metadata before quarantine ACK', async () => {
  for (const status of [401, 403, 404, 400]) {
    const discord = new FakeDiscord();
    const logs: Record<string, unknown>[] = [];
    const quarantine = new MemoryQuarantinePublisher();
    discord.result = {
      kind: 'permanent_failure',
      status,
      reason: status === 400 ? 'discord_payload_rejected' : 'discord_webhook_rejected',
    };
    const result = await processPushBody(
      envelope(),
      dependencies(discord, quarantine, 1_000, { error: (object) => logs.push(object) }),
    );
    assert.equal(result.statusCode, 204);
    assert.equal(quarantine.records.length, 1);
    assert.deepEqual(
      logs,
      status === 400
        ? []
        : [
            {
              event: 'discord_webhook_rejected',
              status,
              errorId: discord.calls[0]?.errorId,
            },
          ],
    );
    assert.equal(JSON.stringify(logs).includes('SENSITIVE'), false);
    assert.equal(JSON.stringify(logs).includes(CONFIG.discordWebhookUrl), false);
  }
});

test('accepts development source environment independently of NODE_ENV', async () => {
  const config = { ...CONFIG, sourceEnvironment: 'development' as const };
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const delivery = new DeliveryService(discord, quarantine, () => 1_000);
  const deps: RelayDependencies = { config, delivery, quarantine };
  assert.equal(
    (
      await processPushBody(
        envelope(
          validLog({
            jsonPayload: {
              ...(validLog().jsonPayload as object),
              environment: 'development',
            },
          }),
        ),
        deps,
      )
    ).statusCode,
    204,
  );
  assert.equal(discord.calls.length, 1);
});

test('input limits and Discord webhook validation are enforced', async () => {
  const tooLargeData = Buffer.alloc(MAX_PUBSUB_DATA_BYTES + 1, 65).toString('base64');
  const parsed = parsePushEnvelope(
    {
      subscription: CONFIG.expectedSubscription,
      message: { data: tooLargeData },
    },
    CONFIG.expectedSubscription,
  );
  assert.equal(parsed.ok, false);

  assert.throws(() => validateDiscordWebhookUrl('http://discord.com/api/webhooks/123456/token'));
  assert.throws(() =>
    validateDiscordWebhookUrl('https://discordapp.com/api/webhooks/123456/token'),
  );
  assert.throws(() => validateDiscordWebhookUrl(`${CONFIG.discordWebhookUrl}?wait=true`));
  assert.equal(validateDiscordWebhookUrl(CONFIG.discordWebhookUrl), CONFIG.discordWebhookUrl);

  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const oversizedBody = 'x'.repeat(MAX_HTTP_BODY_BYTES + 1);
  const result = await processPushBody(oversizedBody, dependencies(discord, quarantine));
  assert.equal(result.statusCode, 204);
  assert.equal(discord.calls.length, 0);
  assert.equal(quarantine.records[0]?.reason, 'body_too_large');
});

test('source environment is required and method/route input is bounded', async () => {
  const baseEnvironment = {
    GCP_PROJECT_ID: CONFIG.gcpProjectId,
    SOURCE_API_SERVICE: CONFIG.sourceApiService,
    EXPECTED_SUBSCRIPTION: CONFIG.expectedSubscription,
    QUARANTINE_TOPIC: CONFIG.quarantineTopic,
    DISCORD_WEBHOOK_URL: CONFIG.discordWebhookUrl,
  };
  assert.throws(
    () => loadConfig(baseEnvironment),
    (error: unknown) => error instanceof RelayConfigError && error.field === 'SOURCE_ENVIRONMENT',
  );
  assert.equal(
    loadConfig({ ...baseEnvironment, SOURCE_ENVIRONMENT: 'development' }).sourceEnvironment,
    'development',
  );

  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const methodAndTemplate = validLog({
    jsonPayload: {
      ...(validLog().jsonPayload as object),
      method: 'CONNECT',
      routeTemplate: '/auth/:provider',
      route: '/auth/real-user?secret=SENSITIVE_QUERY',
    },
  });
  assert.equal(
    (await processPushBody(envelope(methodAndTemplate), dependencies(discord, quarantine)))
      .statusCode,
    204,
  );
  assert.equal(discord.calls[0]?.method, 'CONNECT');
  assert.equal(discord.calls[0]?.routeTemplate, '/auth/:provider');

  const invalidMethod = validLog({
    jsonPayload: { ...(validLog().jsonPayload as object), method: 'NOT_A_HTTP_METHOD' },
  });
  assert.equal(
    (await processPushBody(envelope(invalidMethod), dependencies(discord, quarantine))).statusCode,
    204,
  );
  assert.equal(quarantine.records.at(-1)?.reason, 'invalid_log_entry');
});

test('Discord client keeps a bounded in-memory rate limit and requires a numeric ACK id', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let now = 1_000;
  let response = new Response(JSON.stringify({ id: '123456789012345678' }), { status: 200 });
  const client = new DiscordClient(
    CONFIG.discordWebhookUrl,
    async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return response;
    },
    5_000,
    () => now,
  );
  const alertSummary = summary();

  assert.deepEqual(await client.send(alertSummary), {
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
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'rate_limited',
    status: 429,
  });
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'rate_limited',
    status: 429,
  });
  assert.equal(requests.length, 2);

  now = 4_001;
  response = new Response('{}', { status: 200 });
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });
});

test('Discord client uses fallback and cap values, resets on a new instance, and classifies failures', async () => {
  let now = 1_000;
  let response = new Response('not-json', { status: 429 });
  let calls = 0;
  const client = new DiscordClient(
    CONFIG.discordWebhookUrl,
    async () => {
      calls += 1;
      return response;
    },
    5_000,
    () => now,
  );
  const alertSummary = summary();

  assert.deepEqual(await client.send(alertSummary), {
    kind: 'rate_limited',
    status: 429,
  });
  now = 2_000;
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'rate_limited',
    status: 429,
  });
  assert.equal(calls, 1);

  now = 61_000;
  response = new Response('not-json', {
    status: 429,
    headers: { 'retry-after': '90000' },
  });
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'rate_limited',
    status: 429,
  });

  let freshCalls = 0;
  const fresh = new DiscordClient(CONFIG.discordWebhookUrl, async () => {
    freshCalls += 1;
    return new Response(JSON.stringify({ id: '1' }), { status: 200 });
  });
  assert.deepEqual(await fresh.send(alertSummary), {
    kind: 'success',
    status: 200,
    messageId: '1',
  });
  assert.equal(freshCalls, 1);

  for (const status of [401, 403, 404]) {
    const rejected = new DiscordClient(
      CONFIG.discordWebhookUrl,
      async () => new Response('rejected', { status }),
    );
    assert.deepEqual(await rejected.send(alertSummary), {
      kind: 'permanent_failure',
      status,
      reason: 'discord_webhook_rejected',
    });
  }

  const payloadRejected = new DiscordClient(
    CONFIG.discordWebhookUrl,
    async () => new Response('bad payload', { status: 400 }),
  );
  assert.deepEqual(await payloadRejected.send(alertSummary), {
    kind: 'permanent_failure',
    status: 400,
    reason: 'discord_payload_rejected',
  });

  const network = new DiscordClient(CONFIG.discordWebhookUrl, async () => {
    throw new Error('network down');
  });
  assert.deepEqual(await network.send(alertSummary), {
    kind: 'transient_failure',
    reason: 'network',
  });

  const timeout = new DiscordClient(
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
  assert.deepEqual(await timeout.send(alertSummary), {
    kind: 'transient_failure',
    reason: 'timeout',
  });
});

test('Discord client rejects malformed, empty, and oversized success responses', async () => {
  const alertSummary = summary();
  let response = new Response('{}', { status: 200 });
  const client = new DiscordClient(CONFIG.discordWebhookUrl, async () => response);
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });

  response = new Response(JSON.stringify({ id: 'not-numeric' }), { status: 200 });
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });

  let bodyCancelled = false;
  response = new Response(
    new ReadableStream<Uint8Array>({
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
    }),
    { status: 200 },
  );
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });
  assert.equal(bodyCancelled, true);

  response = new Response(null, { status: 200 });
  assert.deepEqual(await client.send(alertSummary), {
    kind: 'transient_failure',
    status: 200,
    reason: 'invalid_response',
  });
});

test('delivery propagates abort and does not start quarantine after the request is gone', async () => {
  const controller = new AbortController();
  let senderOptions: DeliveryOptions | undefined;
  const sender: AlertSender = {
    send: async (_summary, options) => {
      senderOptions = options;
      controller.abort();
      return {
        kind: 'permanent_failure',
        status: 401,
        reason: 'discord_webhook_rejected',
      };
    },
  };
  const quarantine = new MemoryQuarantinePublisher();
  const delivery = new DeliveryService(sender, quarantine, () => 1_000);

  const result = await delivery.deliver(alert(), {
    deadline: 2_000,
    signal: controller.signal,
  });

  assert.equal(senderOptions?.signal, controller.signal);
  assert.equal(result.acknowledged, false);
  assert.equal(quarantine.records.length, 0);
});

test('Discord client aborts an in-flight fetch when the request signal closes', async () => {
  const controller = new AbortController();
  const client = new DiscordClient(
    CONFIG.discordWebhookUrl,
    async (_input, init) => {
      await new Promise<void>((resolve) => {
        init?.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new DOMException('aborted', 'AbortError');
    },
    5_000,
  );

  const pending = client.send(summary(), {
    deadline: Date.now() + 5_000,
    signal: controller.signal,
  });
  controller.abort();

  assert.deepEqual(await pending, {
    kind: 'transient_failure',
    reason: 'timeout',
  });
});

test('Discord 429 bodies are bounded while preserving a valid Retry-After header', async () => {
  let cancelled = false;
  let calls = 0;
  let now = 1_000;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { status: 429, headers: { 'retry-after': '3' } },
  );
  const client = new DiscordClient(
    CONFIG.discordWebhookUrl,
    async () => {
      calls += 1;
      return response;
    },
    5_000,
    () => now,
  );

  assert.deepEqual(await client.send(summary()), {
    kind: 'rate_limited',
    status: 429,
  });
  assert.equal(cancelled, true);
  now = 2_000;
  assert.deepEqual(await client.send(summary()), {
    kind: 'rate_limited',
    status: 429,
  });
  assert.equal(calls, 1);
});

test('Discord 429 stream errors keep the header or fallback cooldown', async () => {
  for (const retryAfter of ['2', undefined]) {
    let calls = 0;
    let now = 1_000;
    const client = new DiscordClient(
      CONFIG.discordWebhookUrl,
      async () => {
        calls += 1;
        const responseHeaders = retryAfter === undefined ? {} : { 'retry-after': retryAfter };
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.error(new Error('response body failed'));
            },
          }),
          { status: 429, headers: responseHeaders },
        );
      },
      5_000,
      () => now,
    );

    assert.deepEqual(await client.send(summary()), {
      kind: 'rate_limited',
      status: 429,
    });
    now = retryAfter === undefined ? 2_000 : 2_999;
    assert.deepEqual(await client.send(summary()), {
      kind: 'rate_limited',
      status: 429,
    });
    assert.equal(calls, 1);
  }
});

test('Discord 429 body reading is cancelled when the fetch deadline expires', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    }),
    { status: 429 },
  );
  const client = new DiscordClient(CONFIG.discordWebhookUrl, async () => response, 5);

  assert.deepEqual(await client.send(summary()), {
    kind: 'transient_failure',
    reason: 'timeout',
  });
  assert.equal(cancelled, true);
});

test('quarantine publisher uses a single bounded no-retry Pub/Sub RPC', async () => {
  const calls: unknown[][] = [];
  const publisher = {
    initialize: async () => undefined,
    publish: async (...args: unknown[]) => {
      calls.push(args);
      return undefined;
    },
  } as unknown as PublisherClient;
  const quarantine = new PubSubQuarantinePublisher(
    publisher,
    {
      quarantineTopic: CONFIG.quarantineTopic,
      sourceProjectId: CONFIG.gcpProjectId,
      sourceService: CONFIG.sourceApiService,
      sourceEnvironment: CONFIG.sourceEnvironment,
    },
    () => 1_000,
  );

  await quarantine.publish(
    { reason: 'malformed_envelope', receivedAt: '2026-10-15T00:00:00.000Z' },
    { deadline: 2_500 },
  );

  const request = calls[0]?.[0] as { topic?: string; messages?: Array<{ data?: Buffer }> };
  const options = calls[0]?.[1] as { retry?: unknown; timeout?: unknown };
  assert.equal(request.topic, CONFIG.quarantineTopic);
  assert.equal(request.messages?.length, 1);
  assert.equal(options.retry, null);
  assert.equal(options.timeout, 1_500);
  assert.equal(
    JSON.parse(request.messages?.[0]?.data?.toString('utf8') ?? '{}').reason,
    'malformed_envelope',
  );
});

test('relay initializes Pub/Sub before opening the HTTP listener', async () => {
  const events: string[] = [];
  const publisher = {
    initialize: async () => {
      events.push('initialize');
    },
    publish: async () => undefined,
  } as unknown as PublisherClient;

  const server = await start({ config: { ...CONFIG, port: 0 }, publisher });
  events.push('listening');
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  assert.deepEqual(events, ['initialize', 'listening']);
});

test('HTTP relay acknowledges a complete POST and leaves no listener behind', async () => {
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const relay = await openRelayServer(dependencies(discord, quarantine));

  try {
    assert.equal(await sendRelayPost(relay.port, envelope()), 204);
    assert.equal(discord.calls.length, 1);
    assert.equal(quarantine.records.length, 0);
  } finally {
    await closeRelayServer(relay.server);
  }
});

test('HTTP body timeout closes a stalled request before any external delivery', async () => {
  const discord = new FakeDiscord();
  const quarantine = new MemoryQuarantinePublisher();
  const relay = await openRelayServer({
    ...dependencies(discord, quarantine),
    requestBudgetMs: 25,
  });
  const request = httpRequest({
    host: '127.0.0.1',
    port: relay.port,
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/json' },
  });
  const requestClosed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      request.destroy();
      reject(new Error('stalled request did not close'));
    }, 500);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    request.once('close', finish);
    request.once('error', finish);
  });

  try {
    request.write(envelope().slice(0, 16));
    await requestClosed;
    assert.equal(discord.calls.length, 0);
    assert.equal(quarantine.records.length, 0);
  } finally {
    request.destroy();
    await closeRelayServer(relay.server);
  }
});

test('HTTP client disconnect after a complete body aborts pending delivery without a quarantine stage', async () => {
  const quarantine = new MemoryQuarantinePublisher();
  let fetchSignal: AbortSignal | undefined;
  const now = Date.now();
  const discord = new DiscordClient(CONFIG.discordWebhookUrl, async (_input, init) => {
    fetchSignal = init?.signal ?? undefined;
    await new Promise<void>((resolve) => {
      if (init?.signal?.aborted) {
        resolve();
        return;
      }
      init?.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    throw new DOMException('aborted', 'AbortError');
  });
  const delivery: DeliveryUseCase = new DeliveryService(discord, quarantine, () => now);
  const relay = await openRelayServer({
    ...dependencies(discord, quarantine, now),
    delivery,
  });
  const request = httpRequest({
    host: '127.0.0.1',
    port: relay.port,
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(envelope()),
    },
  });
  request.once('error', () => undefined);

  try {
    request.end(envelope());
    await waitFor(() => fetchSignal !== undefined);
    assert.equal(fetchSignal?.aborted, false);
    request.destroy();
    await waitFor(() => fetchSignal?.aborted === true);
    assert.equal(quarantine.records.length, 0);
  } finally {
    request.destroy();
    await closeRelayServer(relay.server);
  }
});
