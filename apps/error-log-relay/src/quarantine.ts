import type { PubSub, Topic } from '@google-cloud/pubsub';

import type { RelayConfig } from './config.js';
import type { ClassifiedLogEntry } from './contracts.js';

export const QUARANTINE_REASONS = [
  'body_too_large',
  'malformed_envelope',
  'invalid_log_entry',
  'discord_payload_rejected',
  'discord_channel_disabled',
] as const;

export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export type QuarantineRecord = Readonly<{
  schemaVersion: 1;
  reason: QuarantineReason;
  sourceProjectId: string;
  sourceService: string;
  sourceEnvironment: 'production';
  receivedAt: string;
  errorId?: string;
  statusCode?: number;
  appCode?: 'Z006' | 'Z500';
}>;

export interface QuarantinePublisher {
  publish(record: QuarantineRecord): Promise<void>;
}

export class PubSubQuarantinePublisher implements QuarantinePublisher {
  private readonly topic: Topic;

  constructor(
    pubsub: PubSub,
    private readonly config: Pick<RelayConfig, 'quarantineTopic'>,
  ) {
    this.topic = pubsub.topic(config.quarantineTopic);
  }

  async publish(record: QuarantineRecord): Promise<void> {
    await this.topic.publishMessage({ json: record });
  }
}

export class MemoryQuarantinePublisher implements QuarantinePublisher {
  readonly records: QuarantineRecord[] = [];
  fail = false;

  async publish(record: QuarantineRecord): Promise<void> {
    if (this.fail) throw new Error('quarantine unavailable');
    this.records.push(record);
  }
}

export function createQuarantineRecord(
  reason: QuarantineReason,
  config: Pick<RelayConfig, 'gcpProjectId' | 'sourceApiService' | 'sourceEnvironment'>,
  entry?: Pick<ClassifiedLogEntry, 'errorId' | 'statusCode' | 'appCode'>,
  now = Date.now(),
): QuarantineRecord {
  return {
    schemaVersion: 1,
    reason,
    sourceProjectId: config.gcpProjectId,
    sourceService: config.sourceApiService,
    sourceEnvironment: config.sourceEnvironment,
    receivedAt: new Date(now).toISOString(),
    ...(entry?.errorId === undefined ? {} : { errorId: entry.errorId }),
    ...(entry?.statusCode === undefined ? {} : { statusCode: entry.statusCode }),
    ...(entry?.appCode === undefined ? {} : { appCode: entry.appCode }),
  };
}
