import { URL } from 'node:url';

import { SOURCE_ENVIRONMENT } from './presentation/constants.js';

export { SOURCE_ENVIRONMENT } from './presentation/constants.js';

export type RelayConfig = Readonly<{
  gcpProjectId: string;
  sourceApiService: string;
  expectedSubscription: string;
  quarantineTopic: string;
  firestoreDatabaseId: string;
  channelDocumentPath: string;
  secretVersion: number;
  discordWebhookUrl: string;
  port: number;
  sourceEnvironment: typeof SOURCE_ENVIRONMENT;
  relayServiceName: string;
}>;

export class RelayConfigError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Invalid relay configuration for ${field}: ${message}`);
    this.name = 'RelayConfigError';
    this.field = field;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const gcpProjectId = required(env.GCP_PROJECT_ID, 'GCP_PROJECT_ID');
  const sourceApiService = required(env.SOURCE_API_SERVICE, 'SOURCE_API_SERVICE');
  const expectedSubscription = required(env.EXPECTED_SUBSCRIPTION, 'EXPECTED_SUBSCRIPTION');
  const quarantineTopic = required(env.QUARANTINE_TOPIC, 'QUARANTINE_TOPIC');
  const firestoreDatabaseId = required(env.FIRESTORE_DATABASE_ID, 'FIRESTORE_DATABASE_ID');
  const channelDocumentPath = required(env.CHANNEL_DOCUMENT_PATH, 'CHANNEL_DOCUMENT_PATH');
  const secretVersion = parseSecretVersion(env.DISCORD_SECRET_VERSION);
  const discordWebhookUrl = validateDiscordWebhookUrl(
    required(env.DISCORD_WEBHOOK_URL, 'DISCORD_WEBHOOK_URL'),
  );
  const port = parsePort(env.PORT);
  const relayServiceName = optional(env.K_SERVICE) ?? 'error-log-relay';

  if (!isProjectId(gcpProjectId)) {
    throw new RelayConfigError('GCP_PROJECT_ID', 'must be a valid project identifier');
  }
  if (!isResourceName(expectedSubscription, 'subscriptions')) {
    throw new RelayConfigError(
      'EXPECTED_SUBSCRIPTION',
      'must be projects/{project}/subscriptions/{subscription}',
    );
  }
  if (!isResourceName(quarantineTopic, 'topics')) {
    throw new RelayConfigError('QUARANTINE_TOPIC', 'must be projects/{project}/topics/{topic}');
  }
  if (!isDocumentPath(channelDocumentPath)) {
    throw new RelayConfigError(
      'CHANNEL_DOCUMENT_PATH',
      'must contain an even number of non-empty Firestore path segments',
    );
  }
  if (sourceApiService.length > 128) {
    throw new RelayConfigError('SOURCE_API_SERVICE', 'is too long');
  }
  if (firestoreDatabaseId.length > 128) {
    throw new RelayConfigError('FIRESTORE_DATABASE_ID', 'is too long');
  }
  if (relayServiceName === sourceApiService) {
    throw new RelayConfigError(
      'K_SERVICE',
      'must identify the relay separately from the source API',
    );
  }

  return {
    gcpProjectId,
    sourceApiService,
    expectedSubscription,
    quarantineTopic,
    firestoreDatabaseId,
    channelDocumentPath,
    secretVersion,
    discordWebhookUrl,
    port,
    sourceEnvironment: SOURCE_ENVIRONMENT,
    relayServiceName,
  };
}

export function validateDiscordWebhookUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RelayConfigError('DISCORD_WEBHOOK_URL', 'must be a valid URL');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'discord.com') {
    throw new RelayConfigError(
      'DISCORD_WEBHOOK_URL',
      'must use the canonical https://discord.com host',
    );
  }
  if (parsed.username !== '' || parsed.password !== '' || parsed.port !== '') {
    throw new RelayConfigError('DISCORD_WEBHOOK_URL', 'must not contain credentials or a port');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new RelayConfigError('DISCORD_WEBHOOK_URL', 'must not contain a query or fragment');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (
    parsed.pathname.endsWith('/') ||
    segments.length !== 4 ||
    segments[0] !== 'api' ||
    segments[1] !== 'webhooks' ||
    !/^\d{1,30}$/.test(segments[2] ?? '') ||
    !/^[A-Za-z0-9_.-]{1,256}$/.test(segments[3] ?? '')
  ) {
    throw new RelayConfigError(
      'DISCORD_WEBHOOK_URL',
      'must use the /api/webhooks/{numeric-id}/{token} path',
    );
  }

  return parsed.toString();
}

function required(value: string | undefined, field: string): string {
  const normalized = optional(value);
  if (normalized === undefined) throw new RelayConfigError(field, 'is required');
  return normalized;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function parseSecretVersion(value: string | undefined): number {
  const normalized = optional(value);
  if (normalized === undefined || !/^[1-9]\d*$/.test(normalized)) {
    throw new RelayConfigError('DISCORD_SECRET_VERSION', 'must be an explicit numeric version');
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RelayConfigError('DISCORD_SECRET_VERSION', 'must be a positive safe integer');
  }
  return parsed;
}

function parsePort(value: string | undefined): number {
  const normalized = optional(value) ?? '8080';
  if (!/^\d+$/.test(normalized)) throw new RelayConfigError('PORT', 'must be numeric');
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new RelayConfigError('PORT', 'must be between 1 and 65535');
  }
  return parsed;
}

function isProjectId(value: string): boolean {
  return /^[a-z][a-z0-9-]{0,62}$/.test(value);
}

function isResourceName(value: string, kind: 'subscriptions' | 'topics'): boolean {
  return new RegExp(`^projects/[a-z][a-z0-9-]{0,62}/${kind}/[A-Za-z0-9_.~-]{1,255}$`).test(value);
}

function isDocumentPath(value: string): boolean {
  const segments = value.split('/');
  return (
    segments.length >= 2 &&
    segments.length % 2 === 0 &&
    segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  );
}
