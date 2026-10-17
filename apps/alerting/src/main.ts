import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { v1 } from '@google-cloud/pubsub';
import pino from 'pino';

import { DiscordClient } from './infrastructure/discordClient.js';
import { PubSubQuarantinePublisher, type PublisherClient } from './infrastructure/quarantine.js';
import { loadConfig } from './config.js';
import { createRelayHandler } from './presentation/handler.js';
import { DeliveryService } from './application/service/alertDelivery.service.js';

export type RelayStartOptions = Readonly<{
  config?: ReturnType<typeof loadConfig>;
  publisher?: PublisherClient;
}>;

export async function start(
  options: RelayStartOptions = {},
): Promise<ReturnType<typeof createServer>> {
  const config = options.config ?? loadConfig();
  const logger = pino({
    base: {
      schemaVersion: 1,
      service: config.relayServiceName,
      environment: config.sourceEnvironment,
      producer: 'mogak-error-log-relay',
    },
    formatters: {
      level: (label, number) => ({
        level: number,
        severity: label === 'error' ? 'ERROR' : label === 'warn' ? 'WARNING' : 'INFO',
      }),
    },
  });
  const publisher = options.publisher ?? new v1.PublisherClient({ projectId: config.gcpProjectId });
  try {
    await publisher.initialize();
  } catch {
    logger.error({ event: 'relay_startup_failed' }, 'Error log relay startup failed');
    throw new Error('Error log relay startup failed');
  }
  const discordClient = new DiscordClient(config.discordWebhookUrl);
  const quarantine = new PubSubQuarantinePublisher(publisher, {
    quarantineTopic: config.quarantineTopic,
    sourceProjectId: config.gcpProjectId,
    sourceService: config.sourceApiService,
    sourceEnvironment: config.sourceEnvironment,
  });
  const delivery = new DeliveryService(discordClient, quarantine, Date.now, logger);
  const handler = createRelayHandler({
    config,
    delivery,
    quarantine,
    logger,
  });
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      logger.error({ event: 'relay_handler_failed' }, 'Relay request handling failed');
      if (!response.headersSent && !response.destroyed) response.statusCode = 503;
      if (!response.writableEnded && !response.destroyed) response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('error', onError);
      logger.error({ event: 'relay_startup_failed' }, 'Error log relay startup failed');
      reject(error);
    };
    server.once('error', onError);
    server.listen(config.port, '0.0.0.0', () => {
      server.removeListener('error', onError);
      logger.info({ event: 'relay_started', port: config.port }, 'Error log relay started');
      resolve();
    });
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void start().catch(() => {
    process.exitCode = 1;
  });
}
