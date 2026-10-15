import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { Firestore } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';
import pino from 'pino';

import { FirestoreChannelStateStore } from './infrastructure/channelState.js';
import { DiscordClient } from './infrastructure/discordClient.js';
import { PubSubQuarantinePublisher } from './infrastructure/quarantine.js';
import { loadConfig } from './config.js';
import { createRelayHandler } from './presentation/handler.js';

export function start(): ReturnType<typeof createServer> {
  const config = loadConfig();
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
  const firestore = new Firestore({
    projectId: config.gcpProjectId,
    databaseId: config.firestoreDatabaseId,
  });
  const pubsub = new PubSub({ projectId: config.gcpProjectId });
  const stateStore = new FirestoreChannelStateStore(
    config,
    firestore as unknown as ConstructorParameters<typeof FirestoreChannelStateStore>[1],
  );
  const discordClient = new DiscordClient(config.discordWebhookUrl);
  const quarantine = new PubSubQuarantinePublisher(pubsub, {
    quarantineTopic: config.quarantineTopic,
    sourceProjectId: config.gcpProjectId,
    sourceService: config.sourceApiService,
    sourceEnvironment: config.sourceEnvironment,
  });
  const handler = createRelayHandler({
    config,
    state: stateStore,
    sender: discordClient,
    quarantine,
    logger,
  });
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      logger.error({ event: 'relay_handler_failed' }, 'Relay request handling failed');
      if (!response.headersSent) response.statusCode = 503;
      if (!response.writableEnded) response.end();
    });
  });
  server.listen(config.port, '0.0.0.0', () => {
    logger.info({ event: 'relay_started', port: config.port }, 'Error log relay started');
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
