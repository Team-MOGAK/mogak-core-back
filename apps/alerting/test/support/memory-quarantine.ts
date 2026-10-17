import type {
  DeliveryOptions,
  QuarantinePort,
  QuarantineRecord,
} from '../../src/application/port/alertDelivery.port.js';

export class MemoryQuarantinePublisher implements QuarantinePort {
  readonly records: QuarantineRecord[] = [];
  fail = false;

  async publish(record: QuarantineRecord, options: DeliveryOptions = {}): Promise<void> {
    if (options.signal?.aborted) {
      throw new Error('quarantine unavailable');
    }
    if (this.fail) throw new Error('quarantine unavailable');
    this.records.push(record);
  }
}
