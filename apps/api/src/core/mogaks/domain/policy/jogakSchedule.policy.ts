import type { JogakOccurrenceStatus } from '../vo/jogakExecution.vo';
import {
  ISO_WEEKDAYS,
  type JogakScheduleInput,
  type JogakScheduleWeekdayName,
  type ValidatedJogakSchedule,
} from '../vo/jogakSchedule.vo';

const weekdayByUtcDay: readonly JogakScheduleWeekdayName[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export function validateJogakSchedule(input: JogakScheduleInput): ValidatedJogakSchedule {
  if (!isDateOnly(input.effectiveFrom)) throw new RangeError('invalid effectiveFrom date');
  const effectiveTo = input.effectiveTo === undefined ? null : input.effectiveTo;
  if (
    effectiveTo !== null &&
    (!isDateOnly(effectiveTo) || compareDateOnly(effectiveTo, input.effectiveFrom) < 0)
  ) {
    throw new RangeError('invalid effectiveTo date');
  }
  const weekdays = input.weekdays ?? [];
  if (input.scheduleType === 'ONCE') {
    if (effectiveTo !== null || weekdays.length > 0)
      throw new RangeError('ONCE schedule cannot set end or weekdays');
    return {
      scheduleType: 'ONCE',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      weekdays: [],
    };
  }
  if (input.scheduleType !== 'WEEKLY') throw new RangeError('unsupported schedule type');
  if (weekdays.length === 0) throw new RangeError('weekdays are required');
  if (new Set(weekdays).size !== weekdays.length) throw new RangeError('duplicate weekday');
  if (!weekdays.every(isWeekday)) throw new RangeError('unsupported weekday');
  return { scheduleType: 'WEEKLY', effectiveFrom: input.effectiveFrom, effectiveTo, weekdays };
}

export function occursOn(schedule: ValidatedJogakSchedule, scheduledDate: string): boolean {
  if (!isDateWithin(schedule, scheduledDate)) return false;
  if (schedule.scheduleType === 'ONCE') return scheduledDate === schedule.effectiveFrom;
  return schedule.weekdays.includes(weekdayFor(scheduledDate));
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

export function isDateOnly(value: string): boolean {
  try {
    toUtcDate(value);
    return true;
  } catch {
    return false;
  }
}

export function compareDateOnly(left: string, right: string): number {
  return toUtcDate(left).getTime() - toUtcDate(right).getTime();
}

function isDateWithin(schedule: ValidatedJogakSchedule, date: string): boolean {
  if (compareDateOnly(date, schedule.effectiveFrom) < 0) return false;
  return schedule.effectiveTo === null || compareDateOnly(date, schedule.effectiveTo) <= 0;
}

function isWeekday(value: string): value is JogakScheduleWeekdayName {
  return (ISO_WEEKDAYS as readonly string[]).includes(value);
}

function weekdayFor(value: string): JogakScheduleWeekdayName {
  const weekday = weekdayByUtcDay[toUtcDate(value).getUTCDay()];
  if (weekday === undefined) throw new RangeError(`invalid weekday for ${value}`);
  return weekday;
}

function toUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError(`invalid date-only value: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`invalid date-only value: ${value}`);
  }
  return date;
}
