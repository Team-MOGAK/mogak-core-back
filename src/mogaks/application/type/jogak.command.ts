import type { JogakExecutionStatus } from '../../domain/vo/jogakExecution.vo';
import type { JogakScheduleInput } from '../../domain/vo/jogakSchedule.vo';

export type ScheduleCommand = JogakScheduleInput;
export type CreateJogakCommand = Readonly<{
  mogakId: number;
  title: string;
  schedule: ScheduleCommand;
}>;
export type UpdateJogakCommand = Readonly<{ title: string; schedule?: ScheduleCommand }>;
export type CommandExecution = Readonly<{
  jogakId: number;
  scheduledDate: string;
  desiredStatus: JogakExecutionStatus;
}>;
