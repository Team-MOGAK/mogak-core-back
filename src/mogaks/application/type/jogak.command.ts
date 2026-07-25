import type { JogakExecutionStatus, JogakScheduleInput } from '../../domain/entity/jogak.entity';

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
