export const ISO_WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type JogakScheduleWeekdayName = (typeof ISO_WEEKDAYS)[number];
const JOGAK_SCHEDULE_TYPES = ['ONCE', 'WEEKLY'] as const;

export type JogakScheduleType = (typeof JOGAK_SCHEDULE_TYPES)[number];

export type JogakScheduleInput = Readonly<{
  scheduleType: JogakScheduleType;
  effectiveFrom: string;
  effectiveTo?: string;
  weekdays?: readonly string[];
}>;

export type OnceJogakSchedule = Readonly<{
  scheduleType: 'ONCE';
  effectiveFrom: string;
  effectiveTo: null;
  weekdays: readonly [];
}>;

export type WeeklyJogakSchedule = Readonly<{
  scheduleType: 'WEEKLY';
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: readonly JogakScheduleWeekdayName[];
}>;

export type ValidatedJogakSchedule = OnceJogakSchedule | WeeklyJogakSchedule;

export const JogakScheduleType = {
  parse(value: string): JogakScheduleType {
    if ((JOGAK_SCHEDULE_TYPES as readonly string[]).includes(value)) {
      return value as JogakScheduleType;
    }
    throw new RangeError(`Unsupported Jogak schedule type: ${value}`);
  },
};

export const JogakScheduleWeekdayName = {
  parse(value: string): JogakScheduleWeekdayName {
    if ((ISO_WEEKDAYS as readonly string[]).includes(value)) {
      return value as JogakScheduleWeekdayName;
    }
    throw new RangeError(`Unsupported Jogak schedule weekday: ${value}`);
  },
};
