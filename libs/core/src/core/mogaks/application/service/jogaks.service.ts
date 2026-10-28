import { MAX_DATE_RANGE_DAYS } from '../../../common/resourceLimits';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { requiredTrimmed } from '@core/common/validation/requiredText';
import { MogakException } from '../../domain/exception/mogak.exception';
import {
  decideJogakExecutionTransition,
  isAdHocStartDate,
  snapshotJogakTitle,
} from '../../domain/policy/jogakExecution.policy';
import { validateJogakCapacity } from '../../domain/policy/jogak.policy';
import {
  assertDateRange as assertScheduleDateRange,
  datesInclusive as scheduleDatesInclusive,
  dateRangeDays,
  deriveOccurrenceStatus,
  isDateOnly,
  createJogakSchedule,
  occursOn,
  currentScheduleIndexOn,
  representativeScheduleIndexOn,
  successorScheduleIndexOf,
} from '../../domain/policy/jogakSchedule.policy';
import type { JogakExecutionStatus } from '../../domain/vo/jogakExecution.vo';
import type { JogakScheduleType, ValidatedJogakSchedule } from '../../domain/vo/jogakSchedule.vo';
import type { MogakRepositoryPort } from '../port/mogak.repository.port';
import type { OwnedOccurrencePort } from '../port/ownedOccurrence.port';
import type {
  CreateJogakCommand,
  ScheduleCommand,
  UpdateJogakCommand,
} from '../type/jogak.command';
import type {
  ExecutionResult,
  OccurrenceOrigin,
  OccurrenceResult,
  OccurrenceScheduleResult,
  OwnedJogakResult,
} from '../type/jogak.result';

export const KST_DATE_PROVIDER = Symbol('KST_DATE_PROVIDER');

type ScheduleRecord = Readonly<{
  scheduleId: number;
  schedule: ValidatedJogakSchedule;
  jogakId: number;
  mogakId: number;
  mogakTitle: string;
  jogakTitle: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string;
}>;

type ExecutionResponse = ReturnType<typeof toExecutionResponse>;

/** 실행 응답에 붙는 회차 성격. 일정 밖 실행은 루틴 회차가 아니다. */
type OccurrenceKind = Readonly<{ isRoutine: boolean; origin: OccurrenceOrigin }>;

const AD_HOC: OccurrenceKind = { isRoutine: false, origin: 'AD_HOC' };

export class JogaksService implements OwnedOccurrencePort {
  constructor(
    private readonly repository: MogakRepositoryPort,
    private readonly today: () => string = kstToday,
  ) {}

  async create(userId: number, input: CreateJogakCommand) {
    const schedule = validateSchedule(input.schedule);
    const today = this.today();
    const mogak = await this.repository.findOwnedMogak(userId, input.mogakId);
    if (mogak === null) throw new DomainException(DomainErrorCode.MOGAK_NOT_FOUND);
    if (
      !validateJogakCapacity(
        await this.repository.countJogaksWithCurrentOrFutureSchedule(input.mogakId, today),
      )
    ) {
      throw new DomainException(DomainErrorCode.MAX_MOGAKS);
    }

    const created = await this.repository.createJogakWithSchedule({
      userId,
      mogak,
      title: requiredTrimmed(input.title),
      schedule,
      today,
    });
    return {
      jogakId: created.jogakId,
      mogakId: created.mogakId,
      mogakTitle: created.mogakTitle,
      category: categoryOf(created.categoryCode, created.categoryName, created.customCategoryName),
      title: created.title,
      color: created.color,
      schedule: scheduleResponse(schedule),
    };
  }

  async listDay(userId: number, date: string) {
    const jogaks = await this.projectOccurrences(userId, date, date, { includeAdHoc: true });
    return { size: jogaks.length, jogaks };
  }

  async listOneTime(userId: number, date: string) {
    const jogaks = await this.projectOccurrences(userId, date, date, { scheduleType: 'ONCE' });
    return { size: jogaks.length, jogaks };
  }

  async listRoutines(userId: number, startDate: string, endDate: string) {
    return this.projectOccurrences(userId, startDate, endDate, { scheduleType: 'WEEKLY' });
  }

  async listMogakDay(userId: number, mogakId: number, date: string) {
    if ((await this.repository.findOwnedMogak(userId, mogakId)) === null) {
      throw new DomainException(DomainErrorCode.MOGAK_NOT_FOUND);
    }
    return this.projectOccurrences(userId, date, date, { mogakId, includeAdHoc: true });
  }

  async getDetail(userId: number, jogakId: number) {
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    const schedules = groupScheduleRows(
      await this.repository.listScheduleRowsForOwnedJogak(userId, jogakId),
    );
    const achievements = (await this.repository.listSuccessCounts([jogakId]))[0]?.achievements ?? 0;
    const today = this.today();
    const currentOrLatest = recordAt(
      schedules,
      representativeScheduleIndexOn(
        schedules.map(({ schedule }) => schedule),
        today,
      ),
    );
    return {
      jogakId: jogak.id,
      mogakId: jogak.mogakId,
      mogakTitle: jogak.mogakTitle,
      category: categoryOf(jogak.categoryCode, jogak.categoryName, jogak.customCategoryName),
      title: jogak.title,
      color: jogak.color,
      isRoutine: currentOrLatest?.schedule.scheduleType === 'WEEKLY',
      days: currentOrLatest === undefined ? [] : [...currentOrLatest.schedule.weekdays],
      startDate: currentOrLatest?.schedule.effectiveFrom ?? null,
      endDate: currentOrLatest === undefined ? null : currentOrLatest.schedule.effectiveTo,
      achievements,
      schedules: schedules.map(({ schedule }) => scheduleResponse(schedule)),
    };
  }

  async update(userId: number, jogakId: number, input: UpdateJogakCommand) {
    const today = this.today();
    if (
      input.schedule !== undefined &&
      (await this.repository.findOwnedJogak(userId, jogakId)) === null
    ) {
      throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    }
    const scheduleRows =
      input.schedule === undefined
        ? []
        : groupScheduleRows(await this.repository.listScheduleRowsForOwnedJogak(userId, jogakId));
    const scheduleValues = scheduleRows.map(({ schedule }) => schedule);
    const activeScheduleIndex = currentScheduleIndexOn(scheduleValues, today);
    const activeSchedule = recordAt(scheduleRows, activeScheduleIndex);
    if (input.schedule !== undefined && activeSchedule === undefined) {
      throw new DomainException(DomainErrorCode.INVALID_SCHEDULE);
    }
    const schedule =
      input.schedule === undefined
        ? undefined
        : replacementSchedule(
            input.schedule,
            activeSchedule!,
            recordAt(scheduleRows, successorScheduleIndexOf(scheduleValues, activeScheduleIndex!)),
          );
    const updated = await this.repository.patchOwnedJogak({
      userId,
      jogakId,
      ...(input.title === undefined ? {} : { title: requiredTrimmed(input.title) }),
      ...(schedule === undefined ? {} : { schedule }),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    return {
      jogakId: updated.id,
      mogakId: updated.mogakId,
      mogakTitle: updated.mogakTitle,
      category: categoryOf(updated.categoryCode, updated.categoryName, updated.customCategoryName),
      title: updated.title,
      color: updated.color,
    };
  }

  async delete(userId: number, jogakId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedJogak(userId, jogakId))) {
      throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    }
  }

  async commandExecution(
    userId: number,
    jogakId: number,
    scheduledDate: string,
    desiredStatus: JogakExecutionStatus,
  ) {
    if (!isDateOnly(scheduledDate)) throw new DomainException(DomainErrorCode.INVALID_TARGET_DATE);
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    const schedules = await this.loadSchedules(userId, scheduledDate, scheduledDate, { jogakId });
    const occurrenceSchedule = schedules.find(({ schedule }) => occursOn(schedule, scheduledDate));
    if (occurrenceSchedule === undefined) {
      return this.commandAdHocExecution(jogak, scheduledDate, desiredStatus);
    }
    return this.insertOrTransition(jogak, scheduledDate, desiredStatus, {
      isRoutine: occurrenceSchedule.schedule.scheduleType === 'WEEKLY',
      origin: 'SCHEDULE',
    });
  }

  async resolveOwnedOccurrence(userId: number, jogakId: number, scheduledDate: string) {
    if (!isDateOnly(scheduledDate)) throw new DomainException(DomainErrorCode.INVALID_TARGET_DATE);
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    const schedules = await this.loadSchedules(userId, scheduledDate, scheduledDate, { jogakId });
    if (
      !schedules.some(({ schedule }) => occursOn(schedule, scheduledDate)) &&
      (await this.repository.findExecution(jogakId, scheduledDate)) === null
    ) {
      throw new DomainException(DomainErrorCode.INVALID_TARGET_DATE);
    }
    return { jogakId: jogak.id, mogakId: jogak.mogakId, title: jogak.title };
  }

  /**
   * 그날 발생하는 일정이 없는 조각의 실행 명령. 이미 실행이 있으면 일반 전이 규칙을 따르고,
   * 새 실행은 허용 기간 안의 `start`로만 만든다. 일정은 읽기만 한다.
   */
  private async commandAdHocExecution(
    jogak: OwnedJogakResult,
    scheduledDate: string,
    desiredStatus: JogakExecutionStatus,
  ) {
    const existing = await this.repository.findExecution(jogak.id, scheduledDate);
    if (existing !== null) {
      return {
        created: false,
        execution: await this.transitionExisting(existing, desiredStatus, jogak, AD_HOC, true),
      };
    }
    if (desiredStatus !== 'IN_PROGRESS' || !isAdHocStartDate(scheduledDate, this.today())) {
      throw new DomainException(DomainErrorCode.INVALID_TARGET_DATE);
    }
    return this.insertOrTransition(jogak, scheduledDate, desiredStatus, AD_HOC);
  }

  private async insertOrTransition(
    jogak: OwnedJogakResult,
    scheduledDate: string,
    desiredStatus: JogakExecutionStatus,
    kind: OccurrenceKind,
  ) {
    const inserted = await this.repository.insertExecution({
      jogakId: jogak.id,
      scheduledDate,
      status: desiredStatus,
      jogakTitleSnapshot: snapshotJogakTitle(jogak.title),
    });
    if (inserted !== null) {
      return { created: true, execution: toExecutionResponse(inserted, jogak, kind) };
    }

    const existing = await this.repository.findExecution(jogak.id, scheduledDate);
    if (existing === null) throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    return {
      created: false,
      execution: await this.transitionExisting(existing, desiredStatus, jogak, kind, true),
    };
  }

  private async projectOccurrences(
    userId: number,
    startDate: string,
    endDate: string,
    filters: Readonly<{
      mogakId?: number;
      jogakId?: number;
      scheduleType?: JogakScheduleType;
      /** 일정이 발생하지 않는 날의 실행 기록도 AD_HOC 회차로 포함한다. */
      includeAdHoc?: boolean;
    }> = {},
  ) {
    assertDateRange(startDate, endDate);
    const { includeAdHoc = false, ...scheduleFilters } = filters;
    const schedules = await this.loadSchedules(userId, startDate, endDate, scheduleFilters);
    const executions = await this.repository.listExecutionsForJogaks(
      [...new Set(schedules.map((schedule) => schedule.jogakId))],
      startDate,
      endDate,
    );
    const executionByNaturalKey = new Map(
      executions.map((execution) => [
        executionKey(execution.jogakId, execution.scheduledDate),
        execution,
      ]),
    );
    const today = this.today();
    const dates = datesInclusive(startDate, endDate);
    const occurrences: Omit<OccurrenceResult, 'achievements'>[] = [];
    const scheduledKeys = new Set<string>();

    for (const schedule of schedules) {
      for (const scheduledDate of dates) {
        if (!occursOn(schedule.schedule, scheduledDate)) continue;
        const key = executionKey(schedule.jogakId, scheduledDate);
        scheduledKeys.add(key);
        const execution = executionByNaturalKey.get(key) ?? null;
        occurrences.push({
          jogakId: schedule.jogakId,
          scheduledDate,
          mogakTitle: schedule.mogakTitle,
          category: { code: schedule.categoryCode, name: schedule.categoryName },
          title: execution?.jogakTitleSnapshot ?? schedule.jogakTitle,
          color: schedule.color,
          isRoutine: schedule.schedule.scheduleType === 'WEEKLY',
          origin: 'SCHEDULE',
          status: deriveOccurrenceStatus(execution?.status ?? null, scheduledDate, today),
        });
      }
    }

    if (includeAdHoc) {
      const owned = await this.repository.listOwnedExecutionRows({
        userId,
        startDate,
        endDate,
        ...(scheduleFilters.mogakId === undefined ? {} : { mogakId: scheduleFilters.mogakId }),
      });
      for (const execution of owned) {
        if (scheduledKeys.has(executionKey(execution.jogakId, execution.scheduledDate))) continue;
        const categoryName = execution.categoryName ?? execution.customCategoryName;
        if (categoryName === null) throw new MogakException('Mogak category was not populated');
        occurrences.push({
          jogakId: execution.jogakId,
          scheduledDate: execution.scheduledDate,
          mogakTitle: execution.mogakTitle,
          category: { code: execution.categoryCode, name: categoryName },
          title: execution.jogakTitleSnapshot,
          color: execution.color,
          isRoutine: AD_HOC.isRoutine,
          origin: AD_HOC.origin,
          status: execution.status,
        });
      }
    }

    const successCounts = new Map(
      (
        await this.repository.listSuccessCounts([
          ...new Set(occurrences.map((occurrence) => occurrence.jogakId)),
        ])
      ).map(({ jogakId, achievements }) => [jogakId, achievements]),
    );
    return occurrences
      .map((occurrence): OccurrenceResult => ({
        ...occurrence,
        achievements: successCounts.get(occurrence.jogakId) ?? 0,
      }))
      .sort(
        (left, right) =>
          left.scheduledDate.localeCompare(right.scheduledDate) || left.jogakId - right.jogakId,
      );
  }

  private async loadSchedules(
    userId: number,
    startDate: string,
    endDate: string,
    filters: Readonly<{
      mogakId?: number;
      jogakId?: number;
      scheduleType?: JogakScheduleType;
    }> = {},
  ): Promise<ScheduleRecord[]> {
    const rows = await this.repository.listOccurrenceScheduleRows({
      userId,
      startDate,
      endDate,
      ...(filters.mogakId === undefined ? {} : { mogakId: filters.mogakId }),
      ...(filters.jogakId === undefined ? {} : { jogakId: filters.jogakId }),
      ...(filters.scheduleType === undefined ? {} : { scheduleType: filters.scheduleType }),
    });
    return groupScheduleRows(rows);
  }

  private async transitionExisting(
    existing: ExecutionResult,
    desiredStatus: JogakExecutionStatus,
    jogak: OwnedJogakResult,
    kind: OccurrenceKind,
    retryOnce: boolean,
  ): Promise<ExecutionResponse> {
    const transition = decideJogakExecutionTransition(existing.status, desiredStatus);
    if (transition.type === 'NOOP') return toExecutionResponse(existing, jogak, kind);
    if (transition.type === 'REJECT') {
      throw new DomainException(DomainErrorCode.INVALID_EXECUTION_TRANSITION);
    }

    const updated = await this.repository.updateExecutionStatus({
      executionId: existing.id,
      currentStatus: existing.status,
      desiredStatus,
      now: new Date(),
    });
    if (updated !== null) return toExecutionResponse(updated, jogak, kind);
    const current = await this.repository.findExecution(existing.jogakId, existing.scheduledDate);
    if (current === null) throw new DomainException(DomainErrorCode.JOGAK_NOT_FOUND);
    if (!retryOnce) return this.resolveAfterLostTransition(current, desiredStatus, jogak, kind);
    return this.transitionExisting(current, desiredStatus, jogak, kind, false);
  }

  private resolveAfterLostTransition(
    current: ExecutionResult,
    desiredStatus: JogakExecutionStatus,
    jogak: OwnedJogakResult,
    kind: OccurrenceKind,
  ): ExecutionResponse {
    const transition = decideJogakExecutionTransition(current.status, desiredStatus);
    if (transition.type === 'NOOP') return toExecutionResponse(current, jogak, kind);
    if (transition.type === 'REJECT') {
      throw new DomainException(DomainErrorCode.INVALID_EXECUTION_TRANSITION);
    }
    throw new DomainException(DomainErrorCode.CONFLICT);
  }
}

function validateSchedule(input: ScheduleCommand): ValidatedJogakSchedule {
  try {
    return createJogakSchedule(input);
  } catch (error) {
    if (error instanceof RangeError && error.message === 'weekdays are required') {
      throw new DomainException(DomainErrorCode.ROUTINE_WEEKDAYS_REQUIRED);
    }
    throw new DomainException(DomainErrorCode.INVALID_SCHEDULE);
  }
}

function groupScheduleRows(rows: readonly OccurrenceScheduleResult[]): ScheduleRecord[] {
  const schedules = new Map<number, ScheduleRecord>();
  for (const row of rows) {
    const categoryName = row.categoryName ?? row.customCategoryName;
    if (categoryName === null) {
      throw new MogakException('Mogak category was not populated');
    }
    const existing = schedules.get(row.scheduleId);
    if (existing === undefined) {
      if (row.scheduleType === 'ONCE' && row.weekday !== null) {
        throw new MogakException(
          `Invalid persisted ONCE schedule ${row.scheduleId}: weekday is present`,
        );
      }
      schedules.set(
        row.scheduleId,
        scheduleRecord(row, categoryName, row.weekday === null ? [] : [row.weekday]),
      );
      continue;
    }
    if (row.weekday !== null) {
      if (row.scheduleType === 'ONCE') {
        throw new MogakException(
          `Invalid persisted ONCE schedule ${row.scheduleId}: weekday is present`,
        );
      }
      schedules.set(
        row.scheduleId,
        scheduleRecord(row, categoryName, [...existing.schedule.weekdays, row.weekday]),
      );
    }
  }
  return [...schedules.values()].sort(
    (left, right) =>
      left.schedule.effectiveFrom.localeCompare(right.schedule.effectiveFrom) ||
      left.scheduleId - right.scheduleId,
  );
}

function scheduleRecord(
  row: OccurrenceScheduleResult,
  categoryName: string,
  weekdays: readonly string[],
): ScheduleRecord {
  try {
    return {
      scheduleId: row.scheduleId,
      schedule: createJogakSchedule({
        scheduleType: row.scheduleType,
        effectiveFrom: row.effectiveFrom,
        ...(row.effectiveTo === null ? {} : { effectiveTo: row.effectiveTo }),
        ...(row.scheduleType === 'WEEKLY' ? { weekdays } : {}),
      }),
      jogakId: row.jogakId,
      mogakId: row.mogakId,
      mogakTitle: row.mogakTitle,
      jogakTitle: row.jogakTitle,
      color: row.color,
      categoryCode: row.categoryCode,
      categoryName,
    };
  } catch (error) {
    throw new MogakException(
      `Invalid persisted Jogak schedule ${row.scheduleId}: ${String(error)}`,
      {
        cause: error,
      },
    );
  }
}

function recordAt(
  records: readonly ScheduleRecord[],
  index: number | undefined,
): ScheduleRecord | undefined {
  return index === undefined ? undefined : records[index];
}

function scheduleResponse(schedule: ValidatedJogakSchedule): ValidatedJogakSchedule {
  if (schedule.scheduleType === 'ONCE') {
    return { ...schedule, weekdays: [] };
  }
  return { ...schedule, weekdays: [...schedule.weekdays] };
}

function replacementSchedule(
  input: NonNullable<UpdateJogakCommand['schedule']>,
  active: ScheduleRecord,
  successor: ScheduleRecord | undefined,
) {
  if (
    input.scheduleType === 'WEEKLY' &&
    input.effectiveTo !== undefined &&
    successor !== undefined &&
    input.effectiveTo >= successor.schedule.effectiveFrom
  ) {
    throw new DomainException(DomainErrorCode.INVALID_SCHEDULE);
  }

  return {
    scheduleId: active.scheduleId,
    ...validateSchedule({
      scheduleType: input.scheduleType,
      effectiveFrom: active.schedule.effectiveFrom,
      weekdays: input.weekdays,
      ...(input.scheduleType === 'WEEKLY' &&
      input.effectiveTo === undefined &&
      successor !== undefined
        ? { effectiveTo: previousDate(successor.schedule.effectiveFrom) }
        : input.effectiveTo === undefined
          ? {}
          : { effectiveTo: input.effectiveTo }),
    }),
  };
}

function previousDate(date: string): string {
  const previous = new Date(`${date}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function toExecutionResponse(
  execution: ExecutionResult,
  jogak: OwnedJogakResult,
  kind: OccurrenceKind,
) {
  return {
    executionId: execution.id,
    jogakId: execution.jogakId,
    scheduledDate: execution.scheduledDate,
    status: execution.status,
    title: execution.jogakTitleSnapshot,
    mogakTitle: jogak.mogakTitle,
    category: categoryOf(jogak.categoryCode, jogak.categoryName, jogak.customCategoryName),
    isRoutine: kind.isRoutine,
    origin: kind.origin,
  };
}

function categoryOf(
  code: string | null,
  categoryName: string | null,
  customCategoryName: string | null,
) {
  const name = categoryName ?? customCategoryName;
  if (name === null) throw new MogakException('Mogak category was not populated');
  return { code, name };
}

function assertDateRange(startDate: string, endDate: string): void {
  try {
    assertScheduleDateRange(startDate, endDate);
    if (dateRangeDays(startDate, endDate) > MAX_DATE_RANGE_DAYS) {
      throw new RangeError('date range is too large');
    }
  } catch {
    throw new DomainException(DomainErrorCode.INVALID_TARGET_DATE);
  }
}

function datesInclusive(startDate: string, endDate: string): string[] {
  return scheduleDatesInclusive(startDate, endDate);
}

function executionKey(jogakId: number, scheduledDate: string): string {
  return `${jogakId}:${scheduledDate}`;
}

export function kstToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\./g, '-')
    .replace(/\s/g, '')
    .replace(/-$/, '');
}
