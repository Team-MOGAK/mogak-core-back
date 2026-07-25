import type {
  JogakExecutionStatus,
  JogakOccurrenceStatus,
  JogakScheduleType,
  JogakScheduleWeekdayName,
} from '../../domain/entity/jogak.entity';

export type OwnedJogakResult = Readonly<{
  id: number;
  mogakId: number;
  title: string;
  mogakTitle: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
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
