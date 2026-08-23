import type { JogakScheduleWeekdayName } from './jogakSchedule.vo';

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

export function weekdayFor(value: string): JogakScheduleWeekdayName {
  const weekdays: readonly JogakScheduleWeekdayName[] = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ];
  const weekday = weekdays[toUtcDate(value).getUTCDay()];
  if (weekday === undefined) throw new RangeError(`invalid weekday for ${value}`);
  return weekday;
}

export function toUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError(`invalid date-only value: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`invalid date-only value: ${value}`);
  }
  return date;
}
