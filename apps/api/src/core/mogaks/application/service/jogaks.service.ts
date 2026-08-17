import { DomainException } from '@core/common/error/domainException';
import { requiredTrimmed } from '@core/common/validation/requiredText';
import {
  decideJogakExecutionTransition,
  snapshotJogakTitle,
} from '../../domain/policy/jogakExecution.policy';
import { validateJogakCapacity } from '../../domain/policy/jogak.policy';
import {
  assertDateRange as assertScheduleDateRange,
  datesInclusive as scheduleDatesInclusive,
  deriveOccurrenceStatus,
  isDateOnly,
  occursOn,
  validateJogakSchedule,
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
  OccurrenceResult,
  OccurrenceScheduleResult,
  OwnedJogakResult,
} from '../type/jogak.result';

export const KST_DATE_PROVIDER = Symbol('KST_DATE_PROVIDER');

type ScheduleRecord = ValidatedJogakSchedule &
  Readonly<{
    scheduleId: number;
    jogakId: number;
    mogakId: number;
    mogakTitle: string;
    jogakTitle: string;
    color: string | null;
    categoryCode: string | null;
    categoryName: string;
  }>;

type ExecutionResponse = ReturnType<typeof toExecutionResponse>;

export class JogaksService implements OwnedOccurrencePort {
  constructor(
    private readonly repository: MogakRepositoryPort,
    private readonly today: () => string = kstToday,
  ) {}

  async create(userId: number, input: CreateJogakCommand) {
    const schedule = validateSchedule(input.schedule);
    const mogak = await this.repository.findOwnedMogak(userId, input.mogakId);
    if (mogak === null) throw new DomainException('MOGAK_NOT_FOUND');
    if (
      !validateJogakCapacity(
        await this.repository.countJogaksWithCurrentOrFutureSchedule(input.mogakId, this.today()),
      )
    ) {
      throw new DomainException('MAX_MOGAKS');
    }

    const created = await this.repository.createJogakWithSchedule({
      mogak,
      title: requiredTrimmed(input.title),
      schedule,
    });
    return {
      jogakId: created.jogakId,
      mogakId: created.mogakId,
      mogakTitle: created.mogakTitle,
      category: categoryOf(created.categoryCode, created.categoryName, created.customCategoryName),
      title: created.title,
      color: created.color,
      schedule: {
        scheduleType: created.scheduleType,
        effectiveFrom: created.effectiveFrom,
        effectiveTo: created.effectiveTo,
        weekdays: created.weekdays,
      },
    };
  }

  async listDay(userId: number, date: string) {
    const jogaks = await this.projectOccurrences(userId, date, date);
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
      throw new DomainException('MOGAK_NOT_FOUND');
    }
    return this.projectOccurrences(userId, date, date, { mogakId });
  }

  async getDetail(userId: number, jogakId: number) {
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new DomainException('JOGAK_NOT_FOUND');
    const schedules = groupScheduleRows(
      await this.repository.listScheduleRowsForOwnedJogak(userId, jogakId),
    );
    const achievements = (await this.repository.listSuccessCounts([jogakId]))[0]?.achievements ?? 0;
    const today = this.today();
    const currentOrLatest =
      schedules
        .filter(
          (schedule) =>
            schedule.effectiveFrom <= today &&
            (schedule.effectiveTo === null || schedule.effectiveTo >= today),
        )
        .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ??
      schedules.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
    return {
      jogakId: jogak.id,
      mogakId: jogak.mogakId,
      mogakTitle: jogak.mogakTitle,
      category: categoryOf(jogak.categoryCode, jogak.categoryName, jogak.customCategoryName),
      title: jogak.title,
      color: jogak.color,
      isRoutine: currentOrLatest?.scheduleType === 'WEEKLY',
      days: currentOrLatest?.weekdays ?? [],
      startDate: currentOrLatest?.effectiveFrom ?? null,
      endDate: currentOrLatest?.effectiveTo ?? null,
      achievements,
      schedules: schedules.map((schedule) => ({
        scheduleType: schedule.scheduleType,
        effectiveFrom: schedule.effectiveFrom,
        effectiveTo: schedule.effectiveTo,
        weekdays: schedule.weekdays,
      })),
    };
  }

  async update(userId: number, jogakId: number, input: UpdateJogakCommand) {
    const title = requiredTrimmed(input.title);
    const updated =
      input.schedule === undefined
        ? await this.repository.updateOwnedJogakTitle(userId, jogakId, title, new Date())
        : await this.repository.replaceOwnedJogakSchedule({
            userId,
            jogakId,
            title,
            schedule: validateSchedule(input.schedule),
            now: new Date(),
          });
    if (updated === 'INVALID_EFFECTIVE_FROM') {
      throw new DomainException('INVALID_SCHEDULE');
    }
    if (updated === null) throw new DomainException('JOGAK_NOT_FOUND');
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
      throw new DomainException('JOGAK_NOT_FOUND');
    }
  }

  async commandExecution(
    userId: number,
    jogakId: number,
    scheduledDate: string,
    desiredStatus: JogakExecutionStatus,
  ) {
    if (!isDateOnly(scheduledDate)) throw new DomainException('INVALID_TARGET_DATE');
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new DomainException('JOGAK_NOT_FOUND');
    const schedules = await this.loadSchedules(userId, scheduledDate, scheduledDate, { jogakId });
    const occurrenceSchedule = schedules.find((schedule) => occursOn(schedule, scheduledDate));
    if (occurrenceSchedule === undefined) {
      throw new DomainException('INVALID_TARGET_DATE');
    }
    const isRoutine = occurrenceSchedule.scheduleType === 'WEEKLY';

    const inserted = await this.repository.insertExecution({
      jogakId,
      scheduledDate,
      status: desiredStatus,
      jogakTitleSnapshot: snapshotJogakTitle(jogak.title),
    });
    if (inserted !== null) {
      return { created: true, execution: toExecutionResponse(inserted, jogak, isRoutine) };
    }

    const existing = await this.repository.findExecution(jogakId, scheduledDate);
    if (existing === null) throw new DomainException('JOGAK_NOT_FOUND');
    return {
      created: false,
      execution: await this.transitionExisting(existing, desiredStatus, jogak, isRoutine, true),
    };
  }

  async resolveOwnedOccurrence(userId: number, jogakId: number, scheduledDate: string) {
    if (!isDateOnly(scheduledDate)) throw new DomainException('INVALID_TARGET_DATE');
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new DomainException('JOGAK_NOT_FOUND');
    const schedules = await this.loadSchedules(userId, scheduledDate, scheduledDate, { jogakId });
    if (!schedules.some((schedule) => occursOn(schedule, scheduledDate))) {
      throw new DomainException('INVALID_TARGET_DATE');
    }
    return { jogakId: jogak.id, mogakId: jogak.mogakId, title: jogak.title };
  }

  private async projectOccurrences(
    userId: number,
    startDate: string,
    endDate: string,
    filters: Readonly<{
      mogakId?: number;
      jogakId?: number;
      scheduleType?: JogakScheduleType;
    }> = {},
  ) {
    assertDateRange(startDate, endDate);
    const schedules = await this.loadSchedules(userId, startDate, endDate, filters);
    const executions = await this.repository.listExecutionsForJogaks(
      [...new Set(schedules.map((schedule) => schedule.jogakId))],
      startDate,
      endDate,
    );
    const successCounts = new Map(
      (
        await this.repository.listSuccessCounts([
          ...new Set(schedules.map((schedule) => schedule.jogakId)),
        ])
      ).map(({ jogakId, achievements }) => [jogakId, achievements]),
    );
    const executionByNaturalKey = new Map(
      executions.map((execution) => [
        executionKey(execution.jogakId, execution.scheduledDate),
        execution,
      ]),
    );
    const today = this.today();
    const occurrences: OccurrenceResult[] = [];

    for (const schedule of schedules) {
      for (const scheduledDate of datesInclusive(startDate, endDate)) {
        if (!occursOn(schedule, scheduledDate)) continue;
        const execution =
          executionByNaturalKey.get(executionKey(schedule.jogakId, scheduledDate)) ?? null;
        occurrences.push({
          jogakId: schedule.jogakId,
          scheduledDate,
          mogakTitle: schedule.mogakTitle,
          category: { code: schedule.categoryCode, name: schedule.categoryName },
          title: execution?.jogakTitleSnapshot ?? schedule.jogakTitle,
          color: schedule.color,
          isRoutine: schedule.scheduleType === 'WEEKLY',
          status: deriveOccurrenceStatus(execution?.status ?? null, scheduledDate, today),
          achievements: successCounts.get(schedule.jogakId) ?? 0,
        });
      }
    }

    return occurrences.sort(
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
    isRoutine: boolean,
    retryOnce: boolean,
  ): Promise<ExecutionResponse> {
    const transition = decideJogakExecutionTransition(existing.status, desiredStatus);
    if (transition.type === 'NOOP') return toExecutionResponse(existing, jogak, isRoutine);
    if (transition.type === 'REJECT') {
      throw new DomainException('INVALID_EXECUTION_TRANSITION');
    }

    const updated = await this.repository.updateExecutionStatus({
      executionId: existing.id,
      currentStatus: existing.status,
      desiredStatus,
      now: new Date(),
    });
    if (updated !== null) return toExecutionResponse(updated, jogak, isRoutine);
    const current = await this.repository.findExecution(existing.jogakId, existing.scheduledDate);
    if (current === null) throw new DomainException('JOGAK_NOT_FOUND');
    if (!retryOnce)
      return this.resolveAfterLostTransition(current, desiredStatus, jogak, isRoutine);
    return this.transitionExisting(current, desiredStatus, jogak, isRoutine, false);
  }

  private resolveAfterLostTransition(
    current: ExecutionResult,
    desiredStatus: JogakExecutionStatus,
    jogak: OwnedJogakResult,
    isRoutine: boolean,
  ): ExecutionResponse {
    const transition = decideJogakExecutionTransition(current.status, desiredStatus);
    if (transition.type === 'NOOP') return toExecutionResponse(current, jogak, isRoutine);
    if (transition.type === 'REJECT') {
      throw new DomainException('INVALID_EXECUTION_TRANSITION');
    }
    throw new DomainException('CONFLICT');
  }
}

function validateSchedule(input: ScheduleCommand): ValidatedJogakSchedule {
  try {
    return validateJogakSchedule(input);
  } catch (error) {
    if (error instanceof RangeError && error.message === 'weekdays are required') {
      throw new DomainException('ROUTINE_WEEKDAYS_REQUIRED');
    }
    throw new DomainException('INVALID_SCHEDULE');
  }
}

function groupScheduleRows(rows: readonly OccurrenceScheduleResult[]): ScheduleRecord[] {
  const schedules = new Map<number, ScheduleRecord>();
  for (const row of rows) {
    const categoryName = row.categoryName ?? row.customCategoryName;
    if (categoryName === null) throw new Error('Mogak category was not populated');
    const existing = schedules.get(row.scheduleId);
    if (existing === undefined) {
      if (row.scheduleType !== 'ONCE' && row.scheduleType !== 'WEEKLY') {
        throw new Error(`Unsupported persisted schedule type: ${row.scheduleType}`);
      }
      schedules.set(row.scheduleId, {
        scheduleId: row.scheduleId,
        jogakId: row.jogakId,
        mogakId: row.mogakId,
        mogakTitle: row.mogakTitle,
        jogakTitle: row.jogakTitle,
        color: row.color,
        categoryCode: row.categoryCode,
        categoryName,
        scheduleType: row.scheduleType,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        weekdays: row.weekday === null ? [] : [row.weekday],
      });
      continue;
    }
    if (row.weekday !== null) {
      schedules.set(row.scheduleId, {
        ...existing,
        weekdays: [...existing.weekdays, row.weekday],
      });
    }
  }
  return [...schedules.values()];
}

function toExecutionResponse(
  execution: ExecutionResult,
  jogak: OwnedJogakResult,
  isRoutine: boolean,
) {
  return {
    executionId: execution.id,
    jogakId: execution.jogakId,
    scheduledDate: execution.scheduledDate,
    status: execution.status,
    title: execution.jogakTitleSnapshot,
    mogakTitle: jogak.mogakTitle,
    category: categoryOf(jogak.categoryCode, jogak.categoryName, jogak.customCategoryName),
    isRoutine,
  };
}

function categoryOf(
  code: string | null,
  categoryName: string | null,
  customCategoryName: string | null,
) {
  const name = categoryName ?? customCategoryName;
  if (name === null) throw new Error('Mogak category was not populated');
  return { code, name };
}

function assertDateRange(startDate: string, endDate: string): void {
  try {
    assertScheduleDateRange(startDate, endDate);
  } catch {
    throw new DomainException('INVALID_TARGET_DATE');
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
