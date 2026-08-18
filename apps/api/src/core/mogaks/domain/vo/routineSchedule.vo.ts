import type { ValidatedJogakSchedule } from './jogakSchedule.vo';
import { compareDateOnly, isDateOnly, weekdayFor } from './jogakScheduleDate.vo';
import type { JogakWeekdays } from './jogakWeekdays.vo';

export class RoutineSchedule {
  readonly scheduleType = 'WEEKLY' as const;

  private constructor(
    readonly effectiveFrom: string,
    readonly effectiveTo: string | null,
    readonly weekdays: JogakWeekdays,
  ) {}

  static create(
    effectiveFrom: string,
    effectiveTo: string | null,
    weekdays: JogakWeekdays,
  ): RoutineSchedule {
    if (!isDateOnly(effectiveFrom)) throw new RangeError('invalid effectiveFrom date');
    if (
      effectiveTo !== null &&
      (!isDateOnly(effectiveTo) || compareDateOnly(effectiveTo, effectiveFrom) < 0)
    ) {
      throw new RangeError('invalid effectiveTo date');
    }
    return new RoutineSchedule(effectiveFrom, effectiveTo, weekdays);
  }

  isActiveOn(date: string): boolean {
    return (
      compareDateOnly(date, this.effectiveFrom) >= 0 &&
      (this.effectiveTo === null || compareDateOnly(date, this.effectiveTo) <= 0)
    );
  }

  occursOn(date: string): boolean {
    return this.isActiveOn(date) && this.weekdays.includes(weekdayFor(date));
  }

  toSnapshot(): ValidatedJogakSchedule {
    return {
      scheduleType: 'WEEKLY',
      effectiveFrom: this.effectiveFrom,
      effectiveTo: this.effectiveTo,
      weekdays: this.weekdays.toArray(),
    };
  }
}
