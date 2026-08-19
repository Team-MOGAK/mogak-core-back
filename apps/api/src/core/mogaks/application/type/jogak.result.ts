import type {
  JogakExecutionStatus,
  JogakOccurrenceStatus,
} from '../../domain/vo/jogakExecution.vo';
import type { JogakScheduleType, JogakScheduleWeekdayName } from '../../domain/vo/jogakSchedule.vo';

export type OwnedJogakResult = Readonly<{
  id: number;
  mogakId: number;
  title: string;
  mogakTitle: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  version?: number;
}>;
export type OccurrenceScheduleResult = Readonly<{
  scheduleId: number;
  jogakId: number;
  mogakId: number;
  mogakTitle: string;
  jogakTitle: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  scheduleType: JogakScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekday: JogakScheduleWeekdayName | null;
}>;
export type ExecutionResult = Readonly<{
  id: number;
  jogakId: number;
  scheduledDate: string;
  status: JogakExecutionStatus;
  jogakTitleSnapshot: string;
}>;
/** 조각과 첫 일정을 함께 생성한 application 결과. */
export type CreatedJogakResult = Readonly<{
  jogakId: number;
  mogakId: number;
  mogakTitle: string;
  title: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  scheduleType: JogakScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: readonly JogakScheduleWeekdayName[];
}>;
export type OccurrenceResult = Readonly<{
  jogakId: number;
  scheduledDate: string;
  mogakTitle: string;
  category: Readonly<{ code: string | null; name: string }>;
  title: string;
  color: string | null;
  isRoutine: boolean;
  status: JogakOccurrenceStatus;
  achievements: number;
}>;
