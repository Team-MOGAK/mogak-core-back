import type { v1, CallOptions } from '@google-cloud/pubsub';

import {
  type DeliveryOptions,
  type QuarantinePort,
  type QuarantineReason,
  type QuarantineRecord,
} from '../application/port/alertDelivery.port.js';
import type { SourceEnvironment } from '../application/type/alert.type.js';

const QUARANTINE_PUBLISH_TIMEOUT_MS = 2_000;

export type PublisherClient = Pick<v1.PublisherClient, 'publish' | 'initialize'>;

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
  constructor(
    private readonly publisher: PublisherClient,
    private readonly config: QuarantineConfig,
    private readonly clock: () => number = Date.now,
  ) {}

  async publish(record: QuarantineRecord, options: DeliveryOptions = {}): Promise<void> {
    const remaining = remainingBudget(options, this.clock());
    if (options.signal?.aborted || remaining <= 0) {
      throw new Error('quarantine publish deadline exceeded');
    }

    const callOptions: CallOptions = {
      retry: null,
      timeout: Math.min(QUARANTINE_PUBLISH_TIMEOUT_MS, remaining),
    };
    await this.publisher.publish(
      {
        topic: this.config.quarantineTopic,
        messages: [
          { data: Buffer.from(JSON.stringify(toQuarantineWireRecord(record, this.config))) },
        ],
      },
      callOptions,
    );
    if (options.signal?.aborted || remainingBudget(options, this.clock()) <= 0) {
      throw new Error('quarantine publish deadline exceeded');
    }
  }
}

function remainingBudget(options: DeliveryOptions, now: number): number {
  return options.deadline === undefined
    ? QUARANTINE_PUBLISH_TIMEOUT_MS
    : Math.min(QUARANTINE_PUBLISH_TIMEOUT_MS, options.deadline - now);
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
