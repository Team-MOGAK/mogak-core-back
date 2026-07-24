export const ISO_WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];
export type ScheduleType = 'ONCE' | 'WEEKLY';
export type StoredExecutionStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAIL';
export type OccurrenceStatus = StoredExecutionStatus | 'PENDING' | 'MISSED';

export type OccurrenceSchedule = Readonly<{
  scheduleType: ScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: readonly IsoWeekday[];
}>;

const weekdayByUtcDay: readonly IsoWeekday[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export function occursOn(schedule: OccurrenceSchedule, scheduledDate: string): boolean {
  if (!isDateWithin(schedule, scheduledDate)) return false;
  if (schedule.scheduleType === 'ONCE') return scheduledDate === schedule.effectiveFrom;

  return schedule.weekdays.includes(weekdayFor(scheduledDate));
}

export function deriveOccurrenceStatus(
  executionStatus: StoredExecutionStatus | null,
  scheduledDate: string,
  today: string,
): OccurrenceStatus {
  if (executionStatus !== null) return executionStatus;

  return compareDateOnly(scheduledDate, today) < 0 ? 'MISSED' : 'PENDING';
}

export function isDateWithin(schedule: OccurrenceSchedule, date: string): boolean {
  if (compareDateOnly(date, schedule.effectiveFrom) < 0) return false;
  if (schedule.effectiveTo === null) return true;

  return compareDateOnly(date, schedule.effectiveTo) <= 0;
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

export function weekdayFor(value: string): IsoWeekday {
  const weekday = weekdayByUtcDay[toUtcDate(value).getUTCDay()];
  if (weekday === undefined) {
    throw new RangeError(`Invalid UTC weekday for date-only value: ${value}`);
  }

  return weekday;
}

function toUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  return date;
}
