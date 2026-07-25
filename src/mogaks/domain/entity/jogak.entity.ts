export const ISO_WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export const MAX_JOGAKS_PER_MOGAK = 8;

export type JogakScheduleWeekdayName = (typeof ISO_WEEKDAYS)[number];
export type JogakScheduleType = 'ONCE' | 'WEEKLY';
export type JogakExecutionStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAIL';
export type JogakOccurrenceStatus = JogakExecutionStatus | 'PENDING' | 'MISSED';

export type Jogak = Readonly<{
  id: number;
  mogakId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type JogakSchedule = Readonly<{
  id: number;
  jogakId: number;
  scheduleType: JogakScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: Date;
}>;

export type JogakScheduleWeekday = Readonly<{
  id: number;
  scheduleId: number;
  weekday: JogakScheduleWeekdayName;
}>;

export type JogakExecution = Readonly<{
  id: number;
  jogakId: number;
  scheduledDate: string;
  status: JogakExecutionStatus;
  jogakTitleSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type JogakScheduleInput = Readonly<{
  scheduleType: JogakScheduleType;
  effectiveFrom: string;
  effectiveTo?: string;
  weekdays?: readonly string[];
}>;

export type ValidatedJogakSchedule = Readonly<{
  scheduleType: JogakScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: readonly JogakScheduleWeekdayName[];
}>;

export type JogakExecutionTransition = Readonly<{
  type: 'INSERT' | 'NOOP' | 'UPDATE' | 'REJECT';
}>;

const weekdayByUtcDay: readonly JogakScheduleWeekdayName[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export function validateJogakCapacity(existingCount: number): boolean {
  return existingCount < MAX_JOGAKS_PER_MOGAK;
}

export const JogakSchedule = {
  validate(input: JogakScheduleInput): ValidatedJogakSchedule {
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
  },

  occursOn(schedule: ValidatedJogakSchedule, scheduledDate: string): boolean {
    if (!isDateWithin(schedule, scheduledDate)) return false;
    return (
      schedule.scheduleType === 'ONCE' || schedule.weekdays.includes(weekdayFor(scheduledDate))
    );
  },

  deriveOccurrenceStatus(
    executionStatus: JogakExecutionStatus | null,
    scheduledDate: string,
    today: string,
  ): JogakOccurrenceStatus {
    if (executionStatus !== null) return executionStatus;
    return compareDateOnly(scheduledDate, today) < 0 ? 'MISSED' : 'PENDING';
  },

  assertDateRange(startDate: string, endDate: string): void {
    if (!isDateOnly(startDate) || !isDateOnly(endDate) || compareDateOnly(startDate, endDate) > 0) {
      throw new RangeError('invalid date range');
    }
  },

  datesInclusive(startDate: string, endDate: string): string[] {
    this.assertDateRange(startDate, endDate);
    const dates: string[] = [];
    const cursor = toUtcDate(startDate);
    const end = toUtcDate(endDate);
    while (cursor.getTime() <= end.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  },
};

export const JogakExecution = {
  decideTransition(
    current: JogakExecutionStatus | null,
    desired: JogakExecutionStatus,
  ): JogakExecutionTransition {
    if (current === null) return { type: 'INSERT' };
    if (current === desired) return { type: 'NOOP' };
    if (desired === 'IN_PROGRESS') return { type: 'REJECT' };
    return { type: 'UPDATE' };
  },

  snapshot(title: string): string {
    return title;
  },
};

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
