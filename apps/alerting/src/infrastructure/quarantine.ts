import type { PubSub, Topic } from '@google-cloud/pubsub';

import {
  QUARANTINE_REASONS,
  type QuarantinePort,
  type QuarantineReason,
  type QuarantineRecord,
} from '../application/ports.js';

export { QUARANTINE_REASONS };
export type { QuarantineReason, QuarantineRecord };

export type QuarantineWireConfig = Readonly<{
  sourceProjectId: string;
  sourceService: string;
  sourceEnvironment: 'production';
}>;

type QuarantineConfig = Readonly<{ quarantineTopic: string }> & QuarantineWireConfig;

export type QuarantineWireRecord = Readonly<{
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

export type QuarantinePublisher = QuarantinePort;

export class PubSubQuarantinePublisher implements QuarantinePublisher {
  private readonly topic: Topic;

  constructor(
    pubsub: PubSub,
    private readonly config: QuarantineConfig,
  ) {
    this.topic = pubsub.topic(config.quarantineTopic);
  }

  async publish(record: QuarantineRecord): Promise<void> {
    await this.topic.publishMessage({
      json: toQuarantineWireRecord(record, this.config),
    });
  }
}

export function toQuarantineWireRecord(
  record: QuarantineRecord,
  config: QuarantineWireConfig,
): QuarantineWireRecord {
  return {
    schemaVersion: 1,
    reason: record.reason,
    sourceProjectId: config.sourceProjectId,
    sourceService: config.sourceService,
    sourceEnvironment: config.sourceEnvironment,
    receivedAt: record.receivedAt,
    ...(record.errorId === undefined ? {} : { errorId: record.errorId }),
    ...(record.statusCode === undefined ? {} : { statusCode: record.statusCode }),
    ...(record.appCode === undefined ? {} : { appCode: record.appCode }),
  };
}
