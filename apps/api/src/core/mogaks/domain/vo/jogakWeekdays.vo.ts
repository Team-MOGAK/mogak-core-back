import { ISO_WEEKDAYS, type JogakScheduleWeekdayName } from './jogakSchedule.vo';

/** Immutable, non-empty weekday collection used only by a routine schedule. */
export class JogakWeekdays {
  private constructor(private readonly values: readonly JogakScheduleWeekdayName[]) {}

  static create(values: readonly string[]): JogakWeekdays {
    if (values.length === 0) throw new RangeError('weekdays are required');
    if (new Set(values).size !== values.length) throw new RangeError('duplicate weekday');
    if (
      !(values as readonly string[]).every((value) =>
        (ISO_WEEKDAYS as readonly string[]).includes(value),
      )
    ) {
      throw new RangeError('unsupported weekday');
    }
    return new JogakWeekdays([...values] as JogakScheduleWeekdayName[]);
  }

  includes(weekday: JogakScheduleWeekdayName): boolean {
    return this.values.includes(weekday);
  }

  toArray(): JogakScheduleWeekdayName[] {
    return [...this.values];
  }
}
