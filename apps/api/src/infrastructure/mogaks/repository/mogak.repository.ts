import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import {
  jogakExecutions,
  jogakSchedules,
  jogakScheduleWeekdays,
  jogaks,
  modarats,
  mogakCategories,
  mogaks,
} from '../../database/schema';
import type { MogakRepositoryPort } from '@core/mogaks/application/port/mogak.repository.port';
import type {
  MogakCategoryResult,
  MogakResult,
  ModaratResult,
} from '@core/mogaks/application/type/mogak.result';
import type {
  CreatedJogakResult,
  ExecutionResult,
  OccurrenceScheduleResult,
  OwnedJogakResult,
} from '@core/mogaks/application/type/jogak.result';
import { MogakPersistenceException } from '../exception/mogakPersistence.exception';
import { JogakExecutionStatus } from '@core/mogaks/domain/vo/jogakExecution.vo';
import {
  JogakScheduleType,
  JogakScheduleWeekdayName,
} from '@core/mogaks/domain/vo/jogakSchedule.vo';

type CreateModaratInput = Parameters<MogakRepositoryPort['createModarat']>[0];
type UpdateModaratInput = Parameters<MogakRepositoryPort['updateOwnedModarat']>[0];
type CreateMogakInput = Parameters<MogakRepositoryPort['createMogak']>[0];
type UpdateMogakInput = Parameters<MogakRepositoryPort['updateOwnedMogak']>[0];
type ReplaceOwnedJogakScheduleInput = Parameters<
  MogakRepositoryPort['replaceOwnedJogakSchedule']
>[0];
type CreateJogakWithScheduleInput = Parameters<MogakRepositoryPort['createJogakWithSchedule']>[0];
type OccurrenceScheduleQuery = Parameters<MogakRepositoryPort['listOccurrenceScheduleRows']>[0];
type InsertExecutionInput = Parameters<MogakRepositoryPort['insertExecution']>[0];
type ReplaceOwnedJogakScheduleResult = Awaited<
  ReturnType<MogakRepositoryPort['replaceOwnedJogakSchedule']>
>;

@Injectable()
export class MogakRepository implements MogakRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createModarat(input: CreateModaratInput): Promise<ModaratResult> {
    const [created] = await this.db
      .insert(modarats)
      .values({ userId: input.userId, title: input.title, color: input.color })
      .returning({ id: modarats.id, title: modarats.title, color: modarats.color });
    if (created === undefined)
      throw new MogakPersistenceException('Modarat insert did not return a row');
    return created;
  }

  async findOwnedModarat(userId: number, modaratId: number): Promise<ModaratResult | null> {
    const modarat = await this.db.query.modarats.findFirst({
      columns: { id: true, title: true, color: true },
      where: and(eq(modarats.id, modaratId), eq(modarats.userId, userId)),
    });
    return modarat ?? null;
  }

  async listModarats(userId: number): Promise<ModaratResult[]> {
    const rows = await this.db
      .select({ id: modarats.id, title: modarats.title, color: modarats.color })
      .from(modarats)
      .where(eq(modarats.userId, userId));
    return rows;
  }

  async updateOwnedModarat(input: UpdateModaratInput): Promise<ModaratResult | null> {
    const [updated] = await this.db
      .update(modarats)
      .set({ title: input.title, color: input.color, updatedAt: input.now })
      .where(and(eq(modarats.id, input.modaratId), eq(modarats.userId, input.userId)))
      .returning({ id: modarats.id, title: modarats.title, color: modarats.color });
    return updated ?? null;
  }

  async deleteOwnedModarat(userId: number, modaratId: number): Promise<boolean> {
    const deleted = await this.db
      .delete(modarats)
      .where(and(eq(modarats.id, modaratId), eq(modarats.userId, userId)))
      .returning({ id: modarats.id });
    return deleted.length === 1;
  }

  async countMogaks(modaratId: number): Promise<number> {
    const rows = await this.db
      .select({ id: mogaks.id })
      .from(mogaks)
      .where(eq(mogaks.modaratId, modaratId));
    return rows.length;
  }

  async findActiveCategoryByCode(code: string): Promise<MogakCategoryResult | null> {
    const category = await this.db.query.mogakCategories.findFirst({
      columns: { id: true, code: true, name: true },
      where: and(eq(mogakCategories.code, code), eq(mogakCategories.active, true)),
    });
    return category ?? null;
  }

  async listActiveCategories(): Promise<MogakCategoryResult[]> {
    const rows = await this.db
      .select({ id: mogakCategories.id, code: mogakCategories.code, name: mogakCategories.name })
      .from(mogakCategories)
      .where(eq(mogakCategories.active, true));
    return rows;
  }

  async createMogak(input: CreateMogakInput): Promise<MogakResult> {
    const [created] = await this.db
      .insert(mogaks)
      .values({
        modaratId: input.modaratId,
        title: input.title,
        color: input.color,
        categoryId: input.categoryId,
        customCategoryName: input.customCategoryName,
      })
      .returning({
        id: mogaks.id,
        modaratId: mogaks.modaratId,
        title: mogaks.title,
        color: mogaks.color,
        categoryId: mogaks.categoryId,
        customCategoryName: mogaks.customCategoryName,
      });
    if (created === undefined)
      throw new MogakPersistenceException('Mogak insert did not return a row');

    if (created.categoryId === null) {
      return { ...created, categoryCode: null, categoryName: null };
    }
    const category = await this.findCategoryById(created.categoryId);
    if (category === null)
      throw new MogakPersistenceException('Created Mogak category did not exist');
    return { ...created, categoryCode: category.code, categoryName: category.name };
  }

  async listMogaksForOwnedModarat(userId: number, modaratId: number): Promise<MogakResult[]> {
    const rows = await this.db
      .select(selectMogakFields())
      .from(mogaks)
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .where(and(eq(mogaks.modaratId, modaratId), eq(modarats.userId, userId)));
    return rows;
  }

  async findOwnedMogak(userId: number, mogakId: number): Promise<MogakResult | null> {
    const [mogak] = await this.db
      .select(selectMogakFields())
      .from(mogaks)
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .where(and(eq(mogaks.id, mogakId), eq(modarats.userId, userId)));
    return mogak ?? null;
  }

  async updateOwnedMogak(input: UpdateMogakInput): Promise<MogakResult | null> {
    const owned = await this.findOwnedMogak(input.userId, input.mogakId);
    if (owned === null) return null;

    const [updated] = await this.db
      .update(mogaks)
      .set({
        title: input.title,
        color: input.color,
        categoryId: input.categoryId,
        customCategoryName: input.customCategoryName,
        updatedAt: input.now,
      })
      .where(and(eq(mogaks.id, input.mogakId), eq(mogaks.modaratId, owned.modaratId)))
      .returning({ id: mogaks.id });
    if (updated === undefined) return null;
    return this.findOwnedMogak(input.userId, input.mogakId);
  }

  async deleteOwnedMogak(userId: number, mogakId: number): Promise<boolean> {
    const owned = await this.findOwnedMogak(userId, mogakId);
    if (owned === null) return false;

    const deleted = await this.db
      .delete(mogaks)
      .where(and(eq(mogaks.id, mogakId), eq(mogaks.modaratId, owned.modaratId)))
      .returning({ id: mogaks.id });
    return deleted.length === 1;
  }

  async findOwnedJogak(userId: number, jogakId: number): Promise<OwnedJogakResult | null> {
    const [jogak] = await this.db
      .select(selectOwnedJogakFields())
      .from(jogaks)
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .where(and(eq(jogaks.id, jogakId), eq(modarats.userId, userId)));
    return jogak ?? null;
  }

  async updateOwnedJogakTitle(
    userId: number,
    jogakId: number,
    title: string,
    now: Date,
  ): Promise<OwnedJogakResult | null> {
    const owned = await this.findOwnedJogak(userId, jogakId);
    if (owned === null) return null;
    const [updated] = await this.db
      .update(jogaks)
      .set({ title, updatedAt: now })
      .where(and(eq(jogaks.id, jogakId), eq(jogaks.mogakId, owned.mogakId)))
      .returning({ id: jogaks.id });
    return updated === undefined ? null : { ...owned, title };
  }

  async deleteOwnedJogak(userId: number, jogakId: number): Promise<boolean> {
    const owned = await this.findOwnedJogak(userId, jogakId);
    if (owned === null) return false;
    const deleted = await this.db
      .delete(jogaks)
      .where(and(eq(jogaks.id, jogakId), eq(jogaks.mogakId, owned.mogakId)))
      .returning({ id: jogaks.id });
    return deleted.length === 1;
  }

  async replaceOwnedJogakSchedule(
    input: ReplaceOwnedJogakScheduleInput,
  ): Promise<ReplaceOwnedJogakScheduleResult> {
    const owned = await this.findOwnedJogak(input.userId, input.jogakId);
    if (owned === null) return null;

    return this.db.transaction(async (tx) => {
      const schedules = await tx
        .select({
          id: jogakSchedules.id,
          effectiveFrom: jogakSchedules.effectiveFrom,
          effectiveTo: jogakSchedules.effectiveTo,
        })
        .from(jogakSchedules)
        .where(eq(jogakSchedules.jogakId, input.jogakId));
      if (schedules.some((schedule) => schedule.effectiveFrom === input.schedule.effectiveFrom)) {
        return 'INVALID_EFFECTIVE_FROM';
      }

      const active = schedules
        .filter(
          (schedule) =>
            schedule.effectiveFrom < input.schedule.effectiveFrom &&
            (schedule.effectiveTo === null || schedule.effectiveTo >= input.schedule.effectiveFrom),
        )
        .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
      const successor = schedules
        .filter((schedule) => schedule.effectiveFrom > input.schedule.effectiveFrom)
        .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0];
      if (
        successor !== undefined &&
        input.schedule.effectiveTo !== null &&
        input.schedule.effectiveTo >= successor.effectiveFrom
      ) {
        return 'INVALID_EFFECTIVE_FROM';
      }

      const effectiveTo =
        input.schedule.scheduleType === 'ONCE'
          ? null
          : (input.schedule.effectiveTo ??
            (successor === undefined ? null : previousDate(successor.effectiveFrom)));

      if (active !== undefined) {
        await tx
          .update(jogakSchedules)
          .set({ effectiveTo: previousDate(input.schedule.effectiveFrom) })
          .where(eq(jogakSchedules.id, active.id));
      }
      await tx
        .update(jogaks)
        .set({ title: input.title, updatedAt: input.now })
        .where(and(eq(jogaks.id, input.jogakId), eq(jogaks.mogakId, owned.mogakId)));
      const [createdSchedule] = await tx
        .insert(jogakSchedules)
        .values({
          jogakId: input.jogakId,
          scheduleType: input.schedule.scheduleType,
          effectiveFrom: input.schedule.effectiveFrom,
          effectiveTo,
        })
        .returning({ id: jogakSchedules.id });
      if (createdSchedule === undefined)
        throw new MogakPersistenceException('Jogak schedule insert did not return a row');
      if (input.schedule.weekdays.length > 0) {
        await tx.insert(jogakScheduleWeekdays).values(
          input.schedule.weekdays.map((weekday) => ({
            scheduleId: createdSchedule.id,
            weekday,
          })),
        );
      }
      return { ...owned, title: input.title };
    });
  }

  async countJogaksWithCurrentOrFutureSchedule(mogakId: number, today: string): Promise<number> {
    const rows = await this.db
      .select({ jogakId: jogaks.id })
      .from(jogaks)
      .innerJoin(jogakSchedules, eq(jogakSchedules.jogakId, jogaks.id))
      .where(
        and(
          eq(jogaks.mogakId, mogakId),
          or(
            and(eq(jogakSchedules.scheduleType, 'ONCE'), gte(jogakSchedules.effectiveFrom, today)),
            and(
              eq(jogakSchedules.scheduleType, 'WEEKLY'),
              or(isNull(jogakSchedules.effectiveTo), gte(jogakSchedules.effectiveTo, today)),
            ),
          ),
        ),
      );
    return new Set(rows.map((row) => row.jogakId)).size;
  }

  async createJogakWithSchedule(input: CreateJogakWithScheduleInput): Promise<CreatedJogakResult> {
    return this.db.transaction(async (tx) => {
      const [createdJogak] = await tx
        .insert(jogaks)
        .values({ mogakId: input.mogak.id, title: input.title })
        .returning({ id: jogaks.id });
      if (createdJogak === undefined)
        throw new MogakPersistenceException('Jogak insert did not return a row');

      const [schedule] = await tx
        .insert(jogakSchedules)
        .values({
          jogakId: createdJogak.id,
          scheduleType: input.schedule.scheduleType,
          effectiveFrom: input.schedule.effectiveFrom,
          effectiveTo: input.schedule.effectiveTo,
        })
        .returning({ id: jogakSchedules.id });
      if (schedule === undefined)
        throw new MogakPersistenceException('Jogak schedule insert did not return a row');

      if (input.schedule.weekdays.length > 0) {
        await tx
          .insert(jogakScheduleWeekdays)
          .values(input.schedule.weekdays.map((weekday) => ({ scheduleId: schedule.id, weekday })));
      }

      return {
        jogakId: createdJogak.id,
        mogakId: input.mogak.id,
        title: input.title,
        mogakTitle: input.mogak.title,
        color: input.mogak.color,
        categoryCode: input.mogak.categoryCode,
        categoryName: input.mogak.categoryName,
        customCategoryName: input.mogak.customCategoryName,
        scheduleType: input.schedule.scheduleType,
        effectiveFrom: input.schedule.effectiveFrom,
        effectiveTo: input.schedule.effectiveTo,
        weekdays: input.schedule.weekdays,
      };
    });
  }

  async listOccurrenceScheduleRows(
    query: OccurrenceScheduleQuery,
  ): Promise<OccurrenceScheduleResult[]> {
    const conditions = [
      eq(modarats.userId, query.userId),
      lte(jogakSchedules.effectiveFrom, query.endDate),
      or(isNull(jogakSchedules.effectiveTo), gte(jogakSchedules.effectiveTo, query.startDate)),
    ];
    if (query.mogakId !== undefined) conditions.push(eq(mogaks.id, query.mogakId));
    if (query.jogakId !== undefined) conditions.push(eq(jogaks.id, query.jogakId));
    if (query.scheduleType !== undefined) {
      conditions.push(eq(jogakSchedules.scheduleType, query.scheduleType));
    }

    const rows = await this.db
      .select(selectOccurrenceScheduleFields())
      .from(jogakSchedules)
      .innerJoin(jogaks, eq(jogakSchedules.jogakId, jogaks.id))
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .leftJoin(jogakScheduleWeekdays, eq(jogakScheduleWeekdays.scheduleId, jogakSchedules.id))
      .where(and(...conditions));
    return rows.map((row) => {
      let scheduleType: JogakScheduleType;
      try {
        scheduleType = JogakScheduleType.parse(row.scheduleType);
      } catch {
        throw MogakPersistenceException.unsupportedValue('schedule type', row.scheduleType);
      }

      let weekday: JogakScheduleWeekdayName | null = null;
      if (row.weekday !== null) {
        try {
          weekday = JogakScheduleWeekdayName.parse(row.weekday);
        } catch {
          throw MogakPersistenceException.unsupportedValue('weekday', row.weekday);
        }
      }
      return { ...row, scheduleType, weekday };
    });
  }

  async listScheduleRowsForOwnedJogak(
    userId: number,
    jogakId: number,
  ): Promise<OccurrenceScheduleResult[]> {
    const rows = await this.db
      .select(selectOccurrenceScheduleFields())
      .from(jogakSchedules)
      .innerJoin(jogaks, eq(jogakSchedules.jogakId, jogaks.id))
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .leftJoin(jogakScheduleWeekdays, eq(jogakScheduleWeekdays.scheduleId, jogakSchedules.id))
      .where(and(eq(jogaks.id, jogakId), eq(modarats.userId, userId)));
    return rows.map((row) => {
      let scheduleType: JogakScheduleType;
      try {
        scheduleType = JogakScheduleType.parse(row.scheduleType);
      } catch {
        throw MogakPersistenceException.unsupportedValue('schedule type', row.scheduleType);
      }

      let weekday: JogakScheduleWeekdayName | null = null;
      if (row.weekday !== null) {
        try {
          weekday = JogakScheduleWeekdayName.parse(row.weekday);
        } catch {
          throw MogakPersistenceException.unsupportedValue('weekday', row.weekday);
        }
      }
      return { ...row, scheduleType, weekday };
    });
  }

  async listExecutionsForJogaks(
    jogakIds: readonly number[],
    startDate: string,
    endDate: string,
  ): Promise<ExecutionResult[]> {
    if (jogakIds.length === 0) return [];
    const executions = await this.db
      .select(selectExecutionFields())
      .from(jogakExecutions)
      .where(
        and(
          inArray(jogakExecutions.jogakId, [...jogakIds]),
          gte(jogakExecutions.scheduledDate, startDate),
          lte(jogakExecutions.scheduledDate, endDate),
        ),
      );
    return executions.map((execution) => {
      try {
        return { ...execution, status: JogakExecutionStatus.parse(execution.status) };
      } catch {
        throw MogakPersistenceException.unsupportedValue('execution status', execution.status);
      }
    });
  }

  async listSuccessCounts(
    jogakIds: readonly number[],
  ): Promise<ReadonlyArray<Readonly<{ jogakId: number; achievements: number }>>> {
    if (jogakIds.length === 0) return [];
    return this.db
      .select({
        jogakId: jogakExecutions.jogakId,
        achievements: count(jogakExecutions.id),
      })
      .from(jogakExecutions)
      .where(
        and(inArray(jogakExecutions.jogakId, [...jogakIds]), eq(jogakExecutions.status, 'SUCCESS')),
      )
      .groupBy(jogakExecutions.jogakId);
  }

  async findExecution(jogakId: number, scheduledDate: string): Promise<ExecutionResult | null> {
    const execution = await this.db.query.jogakExecutions.findFirst({
      columns: {
        id: true,
        jogakId: true,
        scheduledDate: true,
        status: true,
        jogakTitleSnapshot: true,
      },
      where: and(
        eq(jogakExecutions.jogakId, jogakId),
        eq(jogakExecutions.scheduledDate, scheduledDate),
      ),
    });
    if (execution === undefined) return null;
    try {
      return { ...execution, status: JogakExecutionStatus.parse(execution.status) };
    } catch {
      throw MogakPersistenceException.unsupportedValue('execution status', execution.status);
    }
  }

  async insertExecution(input: InsertExecutionInput): Promise<ExecutionResult | null> {
    const [execution] = await this.db
      .insert(jogakExecutions)
      .values(input)
      .onConflictDoNothing({ target: [jogakExecutions.jogakId, jogakExecutions.scheduledDate] })
      .returning(selectExecutionFields());
    if (execution === undefined) return null;
    try {
      return { ...execution, status: JogakExecutionStatus.parse(execution.status) };
    } catch {
      throw MogakPersistenceException.unsupportedValue('execution status', execution.status);
    }
  }

  async updateExecutionStatus(input: {
    executionId: number;
    currentStatus: JogakExecutionStatus;
    desiredStatus: JogakExecutionStatus;
    now: Date;
  }): Promise<ExecutionResult | null> {
    const [execution] = await this.db
      .update(jogakExecutions)
      .set({ status: input.desiredStatus, updatedAt: input.now })
      .where(
        and(
          eq(jogakExecutions.id, input.executionId),
          eq(jogakExecutions.status, input.currentStatus),
        ),
      )
      .returning(selectExecutionFields());
    if (execution === undefined) return null;
    try {
      return { ...execution, status: JogakExecutionStatus.parse(execution.status) };
    } catch {
      throw MogakPersistenceException.unsupportedValue('execution status', execution.status);
    }
  }

  private async findCategoryById(categoryId: number): Promise<MogakCategoryResult | null> {
    const category = await this.db.query.mogakCategories.findFirst({
      columns: { id: true, code: true, name: true },
      where: eq(mogakCategories.id, categoryId),
    });
    return category ?? null;
  }
}

function selectMogakFields() {
  return {
    id: mogaks.id,
    modaratId: mogaks.modaratId,
    title: mogaks.title,
    color: mogaks.color,
    categoryCode: mogakCategories.code,
    categoryName: mogakCategories.name,
    customCategoryName: mogaks.customCategoryName,
  };
}

function selectOwnedJogakFields() {
  return {
    id: jogaks.id,
    mogakId: mogaks.id,
    title: jogaks.title,
    mogakTitle: mogaks.title,
    color: mogaks.color,
    categoryCode: mogakCategories.code,
    categoryName: mogakCategories.name,
    customCategoryName: mogaks.customCategoryName,
  };
}

function selectOccurrenceScheduleFields() {
  return {
    scheduleId: jogakSchedules.id,
    jogakId: jogaks.id,
    mogakId: mogaks.id,
    mogakTitle: mogaks.title,
    jogakTitle: jogaks.title,
    color: mogaks.color,
    categoryCode: mogakCategories.code,
    categoryName: mogakCategories.name,
    customCategoryName: mogaks.customCategoryName,
    scheduleType: jogakSchedules.scheduleType,
    effectiveFrom: jogakSchedules.effectiveFrom,
    effectiveTo: jogakSchedules.effectiveTo,
    weekday: jogakScheduleWeekdays.weekday,
  };
}

function selectExecutionFields() {
  return {
    id: jogakExecutions.id,
    jogakId: jogakExecutions.jogakId,
    scheduledDate: jogakExecutions.scheduledDate,
    status: jogakExecutions.status,
    jogakTitleSnapshot: jogakExecutions.jogakTitleSnapshot,
  };
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
