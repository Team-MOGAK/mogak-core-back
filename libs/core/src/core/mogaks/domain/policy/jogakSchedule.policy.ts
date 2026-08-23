import type { JogakOccurrenceStatus } from '../vo/jogakExecution.vo';
import {
  ISO_WEEKDAYS,
  type JogakScheduleInput,
  type JogakScheduleWeekdayName,
  type ValidatedJogakSchedule,
} from '../vo/jogakSchedule.vo';
import { compareDateOnly, isDateOnly, toUtcDate, weekdayFor } from '../vo/jogakScheduleDate.vo';

export function createJogakSchedule(input: JogakScheduleInput): ValidatedJogakSchedule {
  const effectiveTo = input.effectiveTo ?? null;
  if (input.scheduleType === 'ONCE') {
    if (effectiveTo !== null || (input.weekdays?.length ?? 0) > 0)
      throw new RangeError('ONCE schedule cannot set end or weekdays');
    assertDateOnly(input.effectiveFrom, 'effectiveFrom');
    return {
      scheduleType: 'ONCE',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      weekdays: [],
    };
  }
  if (input.scheduleType !== 'WEEKLY') throw new RangeError('unsupported schedule type');
  assertDateOnly(input.effectiveFrom, 'effectiveFrom');
  if (
    effectiveTo !== null &&
    (!isDateOnly(effectiveTo) || compareDateOnly(effectiveTo, input.effectiveFrom) < 0)
  ) {
    throw new RangeError('invalid effectiveTo date');
  }
  return {
    scheduleType: 'WEEKLY',
    effectiveFrom: input.effectiveFrom,
    effectiveTo,
    weekdays: validateWeekdays(input.weekdays ?? []),
  };
}

export function validateJogakSchedule(input: JogakScheduleInput): ValidatedJogakSchedule {
  return createJogakSchedule(input);
}

export function occursOn(schedule: ValidatedJogakSchedule, scheduledDate: string): boolean {
  if (!isActiveOn(schedule, scheduledDate)) return false;
  return schedule.scheduleType === 'ONCE' || schedule.weekdays.includes(weekdayFor(scheduledDate));
}

export function isActiveOn(schedule: ValidatedJogakSchedule, date: string): boolean {
  assertDateOnly(date, 'scheduled date');
  if (schedule.scheduleType === 'ONCE') return date === schedule.effectiveFrom;
  return (
    compareDateOnly(date, schedule.effectiveFrom) >= 0 &&
    (schedule.effectiveTo === null || compareDateOnly(date, schedule.effectiveTo) <= 0)
  );
}

export function currentScheduleIndexOn(
  schedules: readonly ValidatedJogakSchedule[],
  date: string,
): number | undefined {
  return findLastIndex(schedules, (schedule) => isActiveOn(schedule, date));
}

export function activeRoutineScheduleIndexOn(
  schedules: readonly ValidatedJogakSchedule[],
  date: string,
): number | undefined {
  return findLastIndex(
    schedules,
    (schedule) => schedule.scheduleType === 'WEEKLY' && isActiveOn(schedule, date),
  );
}

export function representativeScheduleIndexOn(
  schedules: readonly ValidatedJogakSchedule[],
  date: string,
): number | undefined {
  return (
    activeRoutineScheduleIndexOn(schedules, date) ??
    currentScheduleIndexOn(schedules, date) ??
    (schedules.length === 0 ? undefined : schedules.length - 1)
  );
}

export function successorScheduleIndexOf(
  schedules: readonly ValidatedJogakSchedule[],
  scheduleIndex: number,
): number | undefined {
  const schedule = schedules[scheduleIndex];
  if (schedule === undefined) return undefined;
  return schedules.findIndex((candidate) => candidate.effectiveFrom > schedule.effectiveFrom);
}

export function validateWeekdays(values: readonly string[]): readonly JogakScheduleWeekdayName[] {
  if (values.length === 0) throw new RangeError('weekdays are required');
  if (new Set(values).size !== values.length) throw new RangeError('duplicate weekday');
  if (
    !(values as readonly string[]).every((value) =>
      (ISO_WEEKDAYS as readonly string[]).includes(value),
    )
  ) {
    throw new RangeError('unsupported weekday');
  }
  return [...values] as JogakScheduleWeekdayName[];
}

export function deriveOccurrenceStatus(
  executionStatus: 'IN_PROGRESS' | 'SUCCESS' | 'FAIL' | null,
  scheduledDate: string,
  today: string,
): JogakOccurrenceStatus {
  if (executionStatus !== null) return executionStatus;
  return compareDateOnly(scheduledDate, today) < 0 ? 'MISSED' : 'PENDING';
}

export function assertDateRange(startDate: string, endDate: string): void {
  if (!isDateOnly(startDate) || !isDateOnly(endDate) || compareDateOnly(startDate, endDate) > 0) {
    throw new RangeError('invalid date range');
  }
}

export function datesInclusive(startDate: string, endDate: string): string[] {
  assertDateRange(startDate, endDate);
  const dates: string[] = [];
  const cursor = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export { compareDateOnly, isDateOnly } from '../vo/jogakScheduleDate.vo';

function assertDateOnly(value: string, name: string): void {
  if (!isDateOnly(value)) throw new RangeError(`invalid ${name} date`);
}

function findLastIndex<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): number | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && predicate(value)) return index;
  }
  return undefined;
}
