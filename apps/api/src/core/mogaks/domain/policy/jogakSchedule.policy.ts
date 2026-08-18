import type { JogakOccurrenceStatus } from '../vo/jogakExecution.vo';
import { type JogakScheduleInput, type ValidatedJogakSchedule } from '../vo/jogakSchedule.vo';
import type { JogakSchedule } from '../vo/jogakSchedules.vo';
import { OnceSchedule } from '../vo/onceSchedule.vo';
import { RoutineSchedule } from '../vo/routineSchedule.vo';
import { JogakWeekdays } from '../vo/jogakWeekdays.vo';
import { compareDateOnly, isDateOnly, toUtcDate } from '../vo/jogakScheduleDate.vo';

export function createJogakSchedule(input: JogakScheduleInput): JogakSchedule {
  const effectiveTo = input.effectiveTo ?? null;
  const weekdays = input.weekdays ?? [];
  if (input.scheduleType === 'ONCE') {
    if (effectiveTo !== null || weekdays.length > 0)
      throw new RangeError('ONCE schedule cannot set end or weekdays');
    return OnceSchedule.create(input.effectiveFrom);
  }
  if (input.scheduleType !== 'WEEKLY') throw new RangeError('unsupported schedule type');
  return RoutineSchedule.create(input.effectiveFrom, effectiveTo, JogakWeekdays.create(weekdays));
}

export function validateJogakSchedule(input: JogakScheduleInput): ValidatedJogakSchedule {
  return createJogakSchedule(input).toSnapshot();
}

export function occursOn(schedule: ValidatedJogakSchedule, scheduledDate: string): boolean {
  const { effectiveTo, ...input } = schedule;
  return createJogakSchedule({
    ...input,
    ...(effectiveTo === null ? {} : { effectiveTo }),
  }).occursOn(scheduledDate);
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
