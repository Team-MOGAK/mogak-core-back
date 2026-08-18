import type { OnceSchedule } from './onceSchedule.vo';
import { RoutineSchedule } from './routineSchedule.vo';

export type JogakSchedule = OnceSchedule | RoutineSchedule;

/** Immutable chronological history of pure schedules; it deliberately owns no persistence metadata. */
export class JogakSchedules {
  private constructor(private readonly schedules: readonly JogakSchedule[]) {}

  static create(schedules: readonly JogakSchedule[]): JogakSchedules {
    return new JogakSchedules([...schedules]);
  }

  toArray(): JogakSchedule[] {
    return [...this.schedules];
  }

  currentOn(date: string): JogakSchedule | undefined {
    return this.schedules.findLast((schedule) => schedule.isActiveOn(date));
  }

  activeRoutineOn(date: string): RoutineSchedule | undefined {
    return this.schedules.findLast(
      (schedule): schedule is RoutineSchedule =>
        schedule instanceof RoutineSchedule && schedule.isActiveOn(date),
    );
  }

  representativeOn(date: string): JogakSchedule | undefined {
    return this.activeRoutineOn(date) ?? this.currentOn(date) ?? this.latest();
  }

  latest(): JogakSchedule | undefined {
    return this.schedules.at(-1);
  }

  successorOf(schedule: JogakSchedule): JogakSchedule | undefined {
    return this.schedules.find((candidate) => candidate.effectiveFrom > schedule.effectiveFrom);
  }
}
