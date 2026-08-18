import type { JogakExecutionStatus } from '../../domain/vo/jogakExecution.vo';
import type { JogakScheduleInput, JogakScheduleType } from '../../domain/vo/jogakSchedule.vo';

export type ScheduleCommand = JogakScheduleInput;
export type CreateJogakCommand = Readonly<{
  mogakId: number;
  title: string;
  schedule: ScheduleCommand;
}>;
export type UpdateJogakScheduleCommand = Readonly<{
  scheduleType: JogakScheduleType;
  effectiveTo?: string;
  weekdays: string[];
}>;
export type UpdateJogakCommand = Readonly<{
  title?: string;
  schedule?: UpdateJogakScheduleCommand;
}>;
export type CommandExecution = Readonly<{
  jogakId: number;
  scheduledDate: string;
  desiredStatus: JogakExecutionStatus;
}>;
