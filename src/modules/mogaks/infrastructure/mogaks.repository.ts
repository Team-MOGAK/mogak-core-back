import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import {
  jogakExecutions,
  jogakSchedules,
  jogakScheduleWeekdays,
  jogaks,
  modarats,
  mogakCategories,
  mogaks,
} from '../../../database/schema';
import type { IsoWeekday, ScheduleType, StoredExecutionStatus } from '../domain/occurrence';

export type ModaratRecord = Readonly<{
  id: number;
  title: string;
  color: string;
}>;

export type MogakCategoryRecord = Readonly<{
  id: number;
  code: string;
  name: string;
}>;

export type MogakRecord = Readonly<{
  id: number;
  modaratId: number;
  title: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
}>;

export type OwnedJogakRecord = Readonly<{
  id: number;
  mogakId: number;
  title: string;
  mogakTitle: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
}>;

export type OccurrenceScheduleRow = Readonly<{
  scheduleId: number;
  jogakId: number;
  mogakId: number;
  mogakTitle: string;
  jogakTitle: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  scheduleType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekday: string | null;
}>;

export type ExecutionRecord = Readonly<{
  id: number;
  jogakId: number;
  scheduledDate: string;
  status: StoredExecutionStatus;
  jogakTitleSnapshot: string;
}>;

export type SchedulePersistenceInput = Readonly<{
  scheduleType: ScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: readonly IsoWeekday[];
}>;

export type CreatedJogakRecord = Readonly<{
  jogakId: number;
  mogakId: number;
  mogakTitle: string;
  title: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  scheduleType: ScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  weekdays: readonly IsoWeekday[];
}>;

export type CreateModaratInput = Readonly<{
  userId: number;
  title: string;
  color: string;
}>;

export type UpdateModaratInput = Readonly<{
  userId: number;
  modaratId: number;
  title: string;
  color: string;
  now: Date;
}>;

export type CreateMogakInput = Readonly<{
  modaratId: number;
  title: string;
  color: string | null;
  categoryId: number | null;
  customCategoryName: string | null;
}>;

export type UpdateMogakInput = Readonly<{
  userId: number;
  mogakId: number;
  title: string;
  color: string | null;
  categoryId: number | null;
  customCategoryName: string | null;
  now: Date;
}>;

export type CreateJogakWithScheduleInput = Readonly<{
  mogak: MogakRecord;
  title: string;
  schedule: SchedulePersistenceInput;
}>;

export type OccurrenceScheduleQuery = Readonly<{
  userId: number;
  startDate: string;
  endDate: string;
  mogakId?: number;
  jogakId?: number;
  scheduleType?: ScheduleType;
}>;

export type InsertExecutionInput = Readonly<{
  jogakId: number;
  scheduledDate: string;
  status: StoredExecutionStatus;
  jogakTitleSnapshot: string;
}>;

@Injectable()
export class MogaksRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createModarat(input: CreateModaratInput): Promise<ModaratRecord> {
    const [created] = await this.db
      .insert(modarats)
      .values({ userId: input.userId, title: input.title, color: input.color })
      .returning({ id: modarats.id, title: modarats.title, color: modarats.color });
    if (created === undefined) throw new Error('Modarat insert did not return a row');
    return created;
  }

  async findOwnedModarat(userId: number, modaratId: number): Promise<ModaratRecord | null> {
    const modarat = await this.db.query.modarats.findFirst({
      columns: { id: true, title: true, color: true },
      where: and(eq(modarats.id, modaratId), eq(modarats.userId, userId)),
    });
    return modarat ?? null;
  }

  async listModarats(userId: number): Promise<ModaratRecord[]> {
    return this.db
      .select({ id: modarats.id, title: modarats.title, color: modarats.color })
      .from(modarats)
      .where(eq(modarats.userId, userId));
  }

  async updateOwnedModarat(input: UpdateModaratInput): Promise<ModaratRecord | null> {
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

  async findActiveCategoryByCode(code: string): Promise<MogakCategoryRecord | null> {
    const category = await this.db.query.mogakCategories.findFirst({
      columns: { id: true, code: true, name: true },
      where: and(eq(mogakCategories.code, code), eq(mogakCategories.active, true)),
    });
    return category ?? null;
  }

  async listActiveCategories(): Promise<MogakCategoryRecord[]> {
    return this.db
      .select({ id: mogakCategories.id, code: mogakCategories.code, name: mogakCategories.name })
      .from(mogakCategories)
      .where(eq(mogakCategories.active, true));
  }

  async createMogak(input: CreateMogakInput): Promise<MogakRecord> {
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
    if (created === undefined) throw new Error('Mogak insert did not return a row');

    if (created.categoryId === null) {
      return { ...created, categoryCode: null, categoryName: null };
    }
    const category = await this.findCategoryById(created.categoryId);
    if (category === null) throw new Error('Created Mogak category did not exist');
    return { ...created, categoryCode: category.code, categoryName: category.name };
  }

  async listMogaksForOwnedModarat(userId: number, modaratId: number): Promise<MogakRecord[]> {
    const rows = await this.db
      .select(mogakProjection())
      .from(mogaks)
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .where(and(eq(mogaks.modaratId, modaratId), eq(modarats.userId, userId)));
    return rows;
  }

  async findOwnedMogak(userId: number, mogakId: number): Promise<MogakRecord | null> {
    const [mogak] = await this.db
      .select(mogakProjection())
      .from(mogaks)
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .where(and(eq(mogaks.id, mogakId), eq(modarats.userId, userId)));
    return mogak ?? null;
  }

  async updateOwnedMogak(input: UpdateMogakInput): Promise<MogakRecord | null> {
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

  async findOwnedJogak(userId: number, jogakId: number): Promise<OwnedJogakRecord | null> {
    const [jogak] = await this.db
      .select(ownedJogakProjection())
      .from(jogaks)
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .where(and(eq(jogaks.id, jogakId), eq(modarats.userId, userId)));
    return jogak ?? null;
  }

  async countJogaksWithCurrentOrFutureSchedule(mogakId: number, today: string): Promise<number> {
    const rows = await this.db
      .select({ jogakId: jogaks.id })
      .from(jogaks)
      .innerJoin(jogakSchedules, eq(jogakSchedules.jogakId, jogaks.id))
      .where(
        and(
          eq(jogaks.mogakId, mogakId),
          or(isNull(jogakSchedules.effectiveTo), gte(jogakSchedules.effectiveTo, today)),
        ),
      );
    return new Set(rows.map((row) => row.jogakId)).size;
  }

  async createJogakWithSchedule(input: CreateJogakWithScheduleInput): Promise<CreatedJogakRecord> {
    return this.db.transaction(async (tx) => {
      const [createdJogak] = await tx
        .insert(jogaks)
        .values({ mogakId: input.mogak.id, title: input.title })
        .returning({ id: jogaks.id });
      if (createdJogak === undefined) throw new Error('Jogak insert did not return a row');

      const [schedule] = await tx
        .insert(jogakSchedules)
        .values({
          jogakId: createdJogak.id,
          scheduleType: input.schedule.scheduleType,
          effectiveFrom: input.schedule.effectiveFrom,
          effectiveTo: input.schedule.effectiveTo,
        })
        .returning({ id: jogakSchedules.id });
      if (schedule === undefined) throw new Error('Jogak schedule insert did not return a row');

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
  ): Promise<OccurrenceScheduleRow[]> {
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

    return this.db
      .select(occurrenceScheduleProjection())
      .from(jogakSchedules)
      .innerJoin(jogaks, eq(jogakSchedules.jogakId, jogaks.id))
      .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
      .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
      .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
      .leftJoin(jogakScheduleWeekdays, eq(jogakScheduleWeekdays.scheduleId, jogakSchedules.id))
      .where(and(...conditions));
  }

  async listExecutionsForJogaks(
    jogakIds: readonly number[],
    startDate: string,
    endDate: string,
  ): Promise<ExecutionRecord[]> {
    if (jogakIds.length === 0) return [];
    const executions = await this.db
      .select(executionProjection())
      .from(jogakExecutions)
      .where(
        and(
          inArray(jogakExecutions.jogakId, [...jogakIds]),
          gte(jogakExecutions.scheduledDate, startDate),
          lte(jogakExecutions.scheduledDate, endDate),
        ),
      );
    return executions.map(asExecutionRecord);
  }

  async findExecution(jogakId: number, scheduledDate: string): Promise<ExecutionRecord | null> {
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
    return execution === undefined ? null : asExecutionRecord(execution);
  }

  async insertExecution(input: InsertExecutionInput): Promise<ExecutionRecord | null> {
    const [execution] = await this.db
      .insert(jogakExecutions)
      .values(input)
      .onConflictDoNothing({ target: [jogakExecutions.jogakId, jogakExecutions.scheduledDate] })
      .returning(executionProjection());
    return execution === undefined ? null : asExecutionRecord(execution);
  }

  async updateExecutionStatus(input: {
    executionId: number;
    currentStatus: StoredExecutionStatus;
    desiredStatus: StoredExecutionStatus;
    now: Date;
  }): Promise<ExecutionRecord | null> {
    const [execution] = await this.db
      .update(jogakExecutions)
      .set({ status: input.desiredStatus, updatedAt: input.now })
      .where(
        and(
          eq(jogakExecutions.id, input.executionId),
          eq(jogakExecutions.status, input.currentStatus),
        ),
      )
      .returning(executionProjection());
    return execution === undefined ? null : asExecutionRecord(execution);
  }

  private async findCategoryById(categoryId: number): Promise<MogakCategoryRecord | null> {
    const category = await this.db.query.mogakCategories.findFirst({
      columns: { id: true, code: true, name: true },
      where: eq(mogakCategories.id, categoryId),
    });
    return category ?? null;
  }
}

function mogakProjection() {
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

function ownedJogakProjection() {
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

function occurrenceScheduleProjection() {
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

function executionProjection() {
  return {
    id: jogakExecutions.id,
    jogakId: jogakExecutions.jogakId,
    scheduledDate: jogakExecutions.scheduledDate,
    status: jogakExecutions.status,
    jogakTitleSnapshot: jogakExecutions.jogakTitleSnapshot,
  };
}

function asExecutionRecord(execution: {
  id: number;
  jogakId: number;
  scheduledDate: string;
  status: string;
  jogakTitleSnapshot: string;
}): ExecutionRecord {
  if (
    execution.status !== 'IN_PROGRESS' &&
    execution.status !== 'SUCCESS' &&
    execution.status !== 'FAIL'
  ) {
    throw new Error(`Unsupported persisted execution status: ${execution.status}`);
  }
  return {
    id: execution.id,
    jogakId: execution.jogakId,
    scheduledDate: execution.scheduledDate,
    status: execution.status,
    jogakTitleSnapshot: execution.jogakTitleSnapshot,
  };
}
