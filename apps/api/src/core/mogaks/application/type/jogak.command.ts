import type { JogakExecutionStatus } from '../../domain/vo/jogakExecution.vo';
import type { JogakScheduleInput, JogakScheduleType } from '../../domain/vo/jogakSchedule.vo';
import type { MergePatch } from '@core/common/type/mergePatch';

export type ScheduleCommand = JogakScheduleInput;
export type CreateJogakCommand = Readonly<{
  mogakId: number;
  title: string;
  schedule: ScheduleCommand;
}>;
export type UpdateJogakScheduleCommand = Readonly<{
  scheduleType: JogakScheduleType;
  effectiveTo?: string | undefined;
  weekdays: string[];
}>;
export type UpdateJogakCommand = MergePatch<
  Readonly<{ title: string; schedule: UpdateJogakScheduleCommand }>
>;
export type CommandExecution = Readonly<{
  jogakId: number;
  scheduledDate: string;
  desiredStatus: JogakExecutionStatus;
}>;
