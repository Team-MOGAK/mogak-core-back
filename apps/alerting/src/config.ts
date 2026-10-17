import type { SourceEnvironment } from './application/type/alert.type.js';
import { validateDiscordWebhookUrl } from './infrastructure/discord.policy.js';

export type RelayConfig = Readonly<{
  gcpProjectId: string;
  sourceApiService: string;
  expectedSubscription: string;
  quarantineTopic: string;
  discordWebhookUrl: string;
  port: number;
  sourceEnvironment: SourceEnvironment;
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
  const sourceEnvironment = parseSourceEnvironment(env.SOURCE_ENVIRONMENT);
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
  if (sourceApiService.length > 128) {
    throw new RelayConfigError('SOURCE_API_SERVICE', 'is too long');
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
    discordWebhookUrl,
    port,
    sourceEnvironment,
    relayServiceName,
  };
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

function parseSourceEnvironment(value: string | undefined): SourceEnvironment {
  const normalized = optional(value);
  if (normalized === 'development' || normalized === 'production') return normalized;
  throw new RelayConfigError('SOURCE_ENVIRONMENT', 'must be development or production');
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
