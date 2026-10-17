import type {
  QuarantinePort,
  QuarantineRecord,
} from '../../src/application/port/alertDelivery.port.js';

export class MemoryQuarantinePublisher implements QuarantinePort {
  readonly records: QuarantineRecord[] = [];
  fail = false;

  async publish(record: QuarantineRecord): Promise<void> {
    if (this.fail) throw new Error('quarantine unavailable');
    this.records.push(record);
  }
}
