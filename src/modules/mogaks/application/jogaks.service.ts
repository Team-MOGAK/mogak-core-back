import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { decideExecutionTransition } from '../domain/execution-transition';
import {
  compareDateOnly,
  deriveOccurrenceStatus,
  isDateOnly,
  ISO_WEEKDAYS,
  occursOn,
  type IsoWeekday,
  type OccurrenceSchedule,
  type ScheduleType,
  type StoredExecutionStatus,
} from '../domain/occurrence';
import {
  MogaksRepository,
  type ExecutionRecord,
  type OccurrenceScheduleRow,
  type OwnedJogakRecord,
  type SchedulePersistenceInput,
} from '../infrastructure/mogaks.repository';

const MAX_JOGAKS_PER_MOGAK = 8;
export const KST_DATE_PROVIDER = Symbol('KST_DATE_PROVIDER');

export type ScheduleInput = Readonly<{
  scheduleType: ScheduleType;
  effectiveFrom: string;
  effectiveTo?: string;
  weekdays?: readonly string[];
}>;

export type CreateJogakInput = Readonly<{
  mogakId: number;
  title: string;
  schedule: ScheduleInput;
}>;

type OccurrenceProjection = Readonly<{
  jogakId: number;
  scheduledDate: string;
  mogakTitle: string;
  category: Readonly<{ code: string | null; name: string }>;
  title: string;
  color: string | null;
  isRoutine: boolean;
  status: ReturnType<typeof deriveOccurrenceStatus>;
  achievements: number;
}>;

type ScheduleRecord = OccurrenceSchedule &
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

@Injectable()
export class JogaksService {
  constructor(
    @Inject(MogaksRepository) private readonly repository: MogaksRepository,
    @Inject(KST_DATE_PROVIDER) private readonly today: () => string = kstToday,
  ) {}

  async create(userId: number, input: CreateJogakInput) {
    const schedule = validateSchedule(input.schedule);
    const mogak = await this.repository.findOwnedMogak(userId, input.mogakId);
    if (mogak === null) throw new AppException(AppErrorCode.MOGAK_NOT_FOUND);
    if (
      (await this.repository.countJogaksWithCurrentOrFutureSchedule(input.mogakId, this.today())) >=
      MAX_JOGAKS_PER_MOGAK
    ) {
      throw new AppException(AppErrorCode.MAX_MOGAKS);
    }

    const created = await this.repository.createJogakWithSchedule({
      mogak,
      title: input.title.trim(),
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
      throw new AppException(AppErrorCode.MOGAK_NOT_FOUND);
    }
    return this.projectOccurrences(userId, date, date, { mogakId });
  }

  async getDetail(userId: number, jogakId: number) {
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new AppException(AppErrorCode.JOGAK_NOT_FOUND);
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

  async update(
    userId: number,
    jogakId: number,
    input: Readonly<{ title: string; schedule?: ScheduleInput }>,
  ) {
    const title = input.title.trim();
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
      throw new AppException(AppErrorCode.INVALID_SCHEDULE);
    }
    if (updated === null) throw new AppException(AppErrorCode.JOGAK_NOT_FOUND);
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
      throw new AppException(AppErrorCode.JOGAK_NOT_FOUND);
    }
  }

  async commandExecution(
    userId: number,
    jogakId: number,
    scheduledDate: string,
    desiredStatus: StoredExecutionStatus,
  ) {
    if (!isDateOnly(scheduledDate)) throw new AppException(AppErrorCode.INVALID_TARGET_DATE);
    const jogak = await this.repository.findOwnedJogak(userId, jogakId);
    if (jogak === null) throw new AppException(AppErrorCode.JOGAK_NOT_FOUND);
    const schedules = await this.loadSchedules(userId, scheduledDate, scheduledDate, { jogakId });
    if (!schedules.some((schedule) => occursOn(schedule, scheduledDate))) {
      throw new AppException(AppErrorCode.INVALID_TARGET_DATE);
    }

    const inserted = await this.repository.insertExecution({
      jogakId,
      scheduledDate,
      status: desiredStatus,
      jogakTitleSnapshot: jogak.title,
    });
    if (inserted !== null) {
      return { created: true, execution: toExecutionResponse(inserted, jogak) };
    }

    const existing = await this.repository.findExecution(jogakId, scheduledDate);
    if (existing === null) throw new AppException(AppErrorCode.JOGAK_NOT_FOUND);
    return {
      created: false,
      execution: await this.transitionExisting(existing, desiredStatus, jogak, true),
    };
  }

  private async projectOccurrences(
    userId: number,
    startDate: string,
    endDate: string,
    filters: Readonly<{ mogakId?: number; jogakId?: number; scheduleType?: ScheduleType }> = {},
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
    const occurrences: OccurrenceProjection[] = [];

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
    filters: Readonly<{ mogakId?: number; jogakId?: number; scheduleType?: ScheduleType }> = {},
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
    existing: ExecutionRecord,
    desiredStatus: StoredExecutionStatus,
    jogak: OwnedJogakRecord,
    retryOnce: boolean,
  ): Promise<ExecutionResponse> {
    const transition = decideExecutionTransition(existing.status, desiredStatus);
    if (transition.type === 'NOOP') return toExecutionResponse(existing, jogak);
    if (transition.type === 'REJECT') {
      throw new AppException(AppErrorCode.INVALID_EXECUTION_TRANSITION);
    }

    const updated = await this.repository.updateExecutionStatus({
      executionId: existing.id,
      currentStatus: existing.status,
      desiredStatus,
      now: new Date(),
    });
    if (updated !== null) return toExecutionResponse(updated, jogak);
    const current = await this.repository.findExecution(existing.jogakId, existing.scheduledDate);
    if (current === null) throw new AppException(AppErrorCode.JOGAK_NOT_FOUND);
    if (!retryOnce) return this.resolveAfterLostTransition(current, desiredStatus, jogak);
    return this.transitionExisting(current, desiredStatus, jogak, false);
  }

  private resolveAfterLostTransition(
    current: ExecutionRecord,
    desiredStatus: StoredExecutionStatus,
    jogak: OwnedJogakRecord,
  ): ExecutionResponse {
    const transition = decideExecutionTransition(current.status, desiredStatus);
    if (transition.type === 'NOOP') return toExecutionResponse(current, jogak);
    if (transition.type === 'REJECT') {
      throw new AppException(AppErrorCode.INVALID_EXECUTION_TRANSITION);
    }
    throw new AppException(AppErrorCode.CONFLICT);
  }
}

function validateSchedule(input: ScheduleInput): SchedulePersistenceInput {
  if (!isDateOnly(input.effectiveFrom)) throw new AppException(AppErrorCode.INVALID_SCHEDULE);
  const effectiveTo = input.effectiveTo === undefined ? null : input.effectiveTo;
  if (
    effectiveTo !== null &&
    (!isDateOnly(effectiveTo) || compareDateOnly(effectiveTo, input.effectiveFrom) < 0)
  ) {
    throw new AppException(AppErrorCode.INVALID_SCHEDULE);
  }

  const weekdays = input.weekdays ?? [];
  if (input.scheduleType === 'ONCE') {
    if (effectiveTo !== null || weekdays.length > 0) {
      throw new AppException(AppErrorCode.INVALID_SCHEDULE);
    }
    return {
      scheduleType: 'ONCE',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      weekdays: [],
    };
  }
  if (input.scheduleType !== 'WEEKLY') throw new AppException(AppErrorCode.INVALID_SCHEDULE);
  if (weekdays.length === 0) throw new AppException(AppErrorCode.ROUTINE_WEEKDAYS_REQUIRED);
  if (new Set(weekdays).size !== weekdays.length || !weekdays.every(isIsoWeekday)) {
    throw new AppException(AppErrorCode.INVALID_SCHEDULE);
  }
  return {
    scheduleType: 'WEEKLY',
    effectiveFrom: input.effectiveFrom,
    effectiveTo,
    weekdays,
  };
}

function groupScheduleRows(rows: readonly OccurrenceScheduleRow[]): ScheduleRecord[] {
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
        weekdays: row.weekday === null ? [] : [asIsoWeekday(row.weekday)],
      });
      continue;
    }
    if (row.weekday !== null) {
      schedules.set(row.scheduleId, {
        ...existing,
        weekdays: [...existing.weekdays, asIsoWeekday(row.weekday)],
      });
    }
  }
  return [...schedules.values()];
}

function toExecutionResponse(execution: ExecutionRecord, jogak: OwnedJogakRecord) {
  return {
    executionId: execution.id,
    jogakId: execution.jogakId,
    scheduledDate: execution.scheduledDate,
    status: execution.status,
    title: execution.jogakTitleSnapshot,
    mogakTitle: jogak.mogakTitle,
    category: categoryOf(jogak.categoryCode, jogak.categoryName, jogak.customCategoryName),
    isRoutine: true,
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

function isIsoWeekday(value: string): value is IsoWeekday {
  return (ISO_WEEKDAYS as readonly string[]).includes(value);
}

function asIsoWeekday(value: string): IsoWeekday {
  if (!isIsoWeekday(value)) throw new Error(`Unsupported persisted weekday: ${value}`);
  return value;
}

function assertDateRange(startDate: string, endDate: string): void {
  if (!isDateOnly(startDate) || !isDateOnly(endDate) || compareDateOnly(startDate, endDate) > 0) {
    throw new AppException(AppErrorCode.INVALID_TARGET_DATE);
  }
}

function datesInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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
