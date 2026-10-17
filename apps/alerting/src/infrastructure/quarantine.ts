import type { PubSub, Topic } from '@google-cloud/pubsub';

import {
  type QuarantinePort,
  type QuarantineReason,
  type QuarantineRecord,
} from '../application/port/alertDelivery.port.js';
import type { SourceEnvironment } from '../application/type/alert.type.js';

export type QuarantineWireConfig = Readonly<{
  sourceProjectId: string;
  sourceService: string;
  sourceEnvironment: SourceEnvironment;
}>;

type QuarantineConfig = Readonly<{ quarantineTopic: string }> & QuarantineWireConfig;

export type QuarantineWireRecord = Readonly<{
  schemaVersion: 1;
  reason: QuarantineReason;
  sourceProjectId: string;
  sourceService: string;
  sourceEnvironment: SourceEnvironment;
  receivedAt: string;
  errorId?: string;
  statusCode?: number;
  appCode?: string;
}>;

export class PubSubQuarantinePublisher implements QuarantinePort {
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
