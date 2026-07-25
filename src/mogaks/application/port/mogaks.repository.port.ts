import type {
  JogakExecutionStatus,
  ValidatedJogakSchedule,
} from '../../domain/entity/jogak.entity';
import type { ModaratCommand } from '../type/mogak.command';
import type { MogakCategoryResult, MogakResult, ModaratResult } from '../type/mogak.result';
import type {
  ExecutionResult,
  OccurrenceScheduleResult,
  OwnedJogakResult,
} from '../type/jogak.result';

export const MOGAKS_REPOSITORY = Symbol('MOGAKS_REPOSITORY');

export interface MogaksRepositoryPort {
  createModarat(input: Readonly<{ userId: number }> & ModaratCommand): Promise<ModaratResult>;
  findOwnedModarat(userId: number, modaratId: number): Promise<ModaratResult | null>;
  listModarats(userId: number): Promise<ModaratResult[]>;
  updateOwnedModarat(
    input: Readonly<{ userId: number; modaratId: number; now: Date }> & ModaratCommand,
  ): Promise<ModaratResult | null>;
  deleteOwnedModarat(userId: number, modaratId: number): Promise<boolean>;
  countMogaks(modaratId: number): Promise<number>;
  findActiveCategoryByCode(code: string): Promise<MogakCategoryResult | null>;
  listActiveCategories(): Promise<MogakCategoryResult[]>;
  createMogak(
    input: Readonly<{
      modaratId: number;
      title: string;
      color: string | null;
      categoryId: number | null;
      customCategoryName: string | null;
    }>,
  ): Promise<MogakResult>;
  listMogaksForOwnedModarat(userId: number, modaratId: number): Promise<MogakResult[]>;
  findOwnedMogak(userId: number, mogakId: number): Promise<MogakResult | null>;
  updateOwnedMogak(
    input: Readonly<{
      userId: number;
      mogakId: number;
      title: string;
      color: string | null;
      categoryId: number | null;
      customCategoryName: string | null;
      now: Date;
    }>,
  ): Promise<MogakResult | null>;
  deleteOwnedMogak(userId: number, mogakId: number): Promise<boolean>;
  findOwnedJogak(userId: number, jogakId: number): Promise<OwnedJogakResult | null>;
  updateOwnedJogakTitle(
    userId: number,
    jogakId: number,
    title: string,
    now: Date,
  ): Promise<OwnedJogakResult | null>;
  deleteOwnedJogak(userId: number, jogakId: number): Promise<boolean>;
  replaceOwnedJogakSchedule(
    input: Readonly<{
      userId: number;
      jogakId: number;
      title: string;
      schedule: ValidatedJogakSchedule;
      now: Date;
    }>,
  ): Promise<OwnedJogakResult | null | 'INVALID_EFFECTIVE_FROM'>;
  countJogaksWithCurrentOrFutureSchedule(mogakId: number, today: string): Promise<number>;
  createJogakWithSchedule(
    input: Readonly<{ mogak: MogakResult; title: string; schedule: ValidatedJogakSchedule }>,
  ): Promise<
    Readonly<{
      jogakId: number;
      mogakId: number;
      mogakTitle: string;
      title: string;
      color: string | null;
      categoryCode: string | null;
      categoryName: string | null;
      customCategoryName: string | null;
      scheduleType: ValidatedJogakSchedule['scheduleType'];
      effectiveFrom: string;
      effectiveTo: string | null;
      weekdays: readonly ValidatedJogakSchedule['weekdays'][number][];
    }>
  >;
  listOccurrenceScheduleRows(
    query: Readonly<{
      userId: number;
      startDate: string;
      endDate: string;
      mogakId?: number;
      jogakId?: number;
      scheduleType?: ValidatedJogakSchedule['scheduleType'];
    }>,
  ): Promise<OccurrenceScheduleResult[]>;
  listScheduleRowsForOwnedJogak(
    userId: number,
    jogakId: number,
  ): Promise<OccurrenceScheduleResult[]>;
  listExecutionsForJogaks(
    jogakIds: readonly number[],
    startDate: string,
    endDate: string,
  ): Promise<ExecutionResult[]>;
  listSuccessCounts(
    jogakIds: readonly number[],
  ): Promise<ReadonlyArray<Readonly<{ jogakId: number; achievements: number }>>>;
  findExecution(jogakId: number, scheduledDate: string): Promise<ExecutionResult | null>;
  insertExecution(
    input: Readonly<{
      jogakId: number;
      scheduledDate: string;
      status: JogakExecutionStatus;
      jogakTitleSnapshot: string;
    }>,
  ): Promise<ExecutionResult | null>;
  updateExecutionStatus(
    input: Readonly<{
      executionId: number;
      currentStatus: JogakExecutionStatus;
      desiredStatus: JogakExecutionStatus;
      now: Date;
    }>,
  ): Promise<ExecutionResult | null>;
}
