import type { ValidatedJogakSchedule } from './jogakSchedule.vo';
import { isDateOnly } from './jogakScheduleDate.vo';

export class OnceSchedule {
  readonly scheduleType = 'ONCE' as const;

  private constructor(readonly effectiveFrom: string) {}

  static create(effectiveFrom: string): OnceSchedule {
    if (!isDateOnly(effectiveFrom)) throw new RangeError('invalid effectiveFrom date');
    return new OnceSchedule(effectiveFrom);
  }

  isActiveOn(date: string): boolean {
    if (!isDateOnly(date)) throw new RangeError('invalid scheduled date');
    return date === this.effectiveFrom;
  }

  occursOn(date: string): boolean {
    return this.isActiveOn(date);
  }

  toSnapshot(): ValidatedJogakSchedule {
    return {
      scheduleType: 'ONCE',
      effectiveFrom: this.effectiveFrom,
      effectiveTo: null,
      weekdays: [],
    };
  }
}
