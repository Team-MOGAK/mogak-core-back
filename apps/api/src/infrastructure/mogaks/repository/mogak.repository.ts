import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';

import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import { lockUsersForTransaction } from '../../database/transaction/userAdvisoryLock';
import {
  jogakExecutions,
  jogakSchedules,
  jogakScheduleWeekdays,
  jogaks,
  modarats,
  mogakCategories,
  mogaks,
  users,
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
import { MogakPersistenceException } from '@core/mogaks/domain/exception/mogakPersistence.exception';
import { JogakExecutionStatus } from '@core/mogaks/domain/vo/jogakExecution.vo';
import {
  JogakScheduleType,
  JogakScheduleWeekdayName,
} from '@core/mogaks/domain/vo/jogakSchedule.vo';

type CreateModaratInput = Parameters<MogakRepositoryPort['createModarat']>[0];
type UpdateModaratInput = Parameters<MogakRepositoryPort['updateOwnedModarat']>[0];
type CreateMogakInput = Parameters<MogakRepositoryPort['createMogak']>[0];
type UpdateMogakInput = Parameters<MogakRepositoryPort['updateOwnedMogak']>[0];
type PatchOwnedJogakInput = Parameters<MogakRepositoryPort['patchOwnedJogak']>[0];
type CreateJogakWithScheduleInput = Parameters<MogakRepositoryPort['createJogakWithSchedule']>[0];
type OccurrenceScheduleQuery = Parameters<MogakRepositoryPort['listOccurrenceScheduleRows']>[0];
type InsertExecutionInput = Parameters<MogakRepositoryPort['insertExecution']>[0];
type DeletionTransaction = Pick<Database, 'delete' | 'select'>;

@Injectable()
export class MogakRepository implements MogakRepositoryPort {
  private readonly logger = new Logger(MogakRepository.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createModarat(input: CreateModaratInput): Promise<ModaratResult> {
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [input.userId]);
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId));
      if (user === undefined) {
        this.logger.warn({
          event: 'resource_not_found_after_user_lock',
          resource: 'USER',
          operation: 'create_modarat',
        });
        throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
      }
      const [created] = await tx
        .insert(modarats)
        .values({ userId: input.userId, title: input.title, color: input.color })
        .returning({ id: modarats.id, title: modarats.title, color: modarats.color });
      if (created === undefined)
        throw new MogakPersistenceException('Modarat insert did not return a row');
      return created;
    });
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
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [input.userId]);
      const [updated] = await tx
        .update(modarats)
        .set({ title: input.title, color: input.color, updatedAt: input.now })
        .where(and(eq(modarats.id, input.modaratId), eq(modarats.userId, input.userId)))
        .returning({ id: modarats.id, title: modarats.title, color: modarats.color });
      return updated ?? null;
    });
  }

  async deleteOwnedModarat(userId: number, modaratId: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [userId]);
      const [owned] = await tx
        .select({ id: modarats.id })
        .from(modarats)
        .where(and(eq(modarats.id, modaratId), eq(modarats.userId, userId)));
      if (owned === undefined) return false;

      await this.deleteMogakTree(tx, await this.mogakIdsForModarats(tx, [modaratId]));
      const deleted = await tx
        .delete(modarats)
        .where(and(eq(modarats.id, modaratId), eq(modarats.userId, userId)))
        .returning({ id: modarats.id });
      return deleted.length === 1;
    });
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
    return this.db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ userId: modarats.userId })
        .from(modarats)
        .where(eq(modarats.id, input.modaratId));
      if (owner === undefined) throw new MogakPersistenceException('Modarat did not exist');
      await lockUsersForTransaction(tx, [owner.userId]);
      const [stillOwned] = await tx
        .select({ id: modarats.id })
        .from(modarats)
        .where(and(eq(modarats.id, input.modaratId), eq(modarats.userId, owner.userId)));
      if (stillOwned === undefined) throw new MogakPersistenceException('Modarat did not exist');
      const [created] = await tx
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
      const [category] = await tx
        .select({ code: mogakCategories.code, name: mogakCategories.name })
        .from(mogakCategories)
        .where(eq(mogakCategories.id, created.categoryId));
      if (category === undefined)
        throw new MogakPersistenceException('Created Mogak category did not exist');
      return { ...created, categoryCode: category.code, categoryName: category.name };
    });
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
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [input.userId]);
      const [owned] = await tx
        .select({ modaratId: mogaks.modaratId })
        .from(mogaks)
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .where(and(eq(mogaks.id, input.mogakId), eq(modarats.userId, input.userId)));
      if (owned === undefined) return null;
      const [updated] = await tx
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
      const [result] = await tx
        .select(selectMogakFields())
        .from(mogaks)
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
        .where(and(eq(mogaks.id, input.mogakId), eq(modarats.userId, input.userId)));
      return result ?? null;
    });
  }

  async deleteOwnedMogak(userId: number, mogakId: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [userId]);
      const [owned] = await tx
        .select({ id: mogaks.id })
        .from(mogaks)
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .where(and(eq(mogaks.id, mogakId), eq(modarats.userId, userId)));
      if (owned === undefined) return false;

      await this.deleteMogakTree(tx, [mogakId]);
      return true;
    });
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

  async patchOwnedJogak(input: PatchOwnedJogakInput): Promise<OwnedJogakResult | null> {
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [input.userId]);
      const [owned] = await tx
        .select(selectOwnedJogakFields())
        .from(jogaks)
        .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .leftJoin(mogakCategories, eq(mogaks.categoryId, mogakCategories.id))
        .where(and(eq(jogaks.id, input.jogakId), eq(modarats.userId, input.userId)));
      if (owned === undefined) return null;
      const [updatedJogak] = await tx
        .update(jogaks)
        .set({ ...(input.title === undefined ? {} : { title: input.title }), updatedAt: input.now })
        .where(and(eq(jogaks.id, input.jogakId), eq(jogaks.mogakId, owned.mogakId)))
        .returning({ id: jogaks.id });
      if (updatedJogak === undefined) return null;
      if (input.schedule !== undefined) {
        const schedule = input.schedule;
        const [updatedSchedule] = await tx
          .update(jogakSchedules)
          .set({
            scheduleType: schedule.scheduleType,
            effectiveTo: schedule.effectiveTo,
          })
          .where(
            and(
              eq(jogakSchedules.id, schedule.scheduleId),
              eq(jogakSchedules.jogakId, input.jogakId),
            ),
          )
          .returning({ id: jogakSchedules.id });
        if (updatedSchedule === undefined) {
          throw new MogakPersistenceException('Jogak schedule update did not return a row');
        }
        await tx
          .delete(jogakScheduleWeekdays)
          .where(eq(jogakScheduleWeekdays.scheduleId, schedule.scheduleId));
        if (schedule.weekdays.length > 0) {
          await tx.insert(jogakScheduleWeekdays).values(
            schedule.weekdays.map((weekday) => ({
              scheduleId: schedule.scheduleId,
              weekday,
            })),
          );
        }
      }
      return {
        ...owned,
        ...(input.title === undefined ? {} : { title: input.title }),
      };
    });
  }

  async deleteOwnedJogak(userId: number, jogakId: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockUsersForTransaction(tx, [userId]);
      const [owned] = await tx
        .select({ id: jogaks.id })
        .from(jogaks)
        .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .where(and(eq(jogaks.id, jogakId), eq(modarats.userId, userId)));
      if (owned === undefined) return false;

      await this.deleteJogakTree(tx, [jogakId]);
      return true;
    });
  }

  private async mogakIdsForModarats(
    tx: DeletionTransaction,
    modaratIds: readonly number[],
  ): Promise<number[]> {
    if (modaratIds.length === 0) return [];
    const rows = await tx
      .select({ id: mogaks.id })
      .from(mogaks)
      .where(inArray(mogaks.modaratId, [...modaratIds]));
    return rows.map((row) => row.id);
  }

  private async deleteMogakTree(
    tx: DeletionTransaction,
    mogakIds: readonly number[],
  ): Promise<void> {
    if (mogakIds.length === 0) return;
    const rows = await tx
      .select({ id: jogaks.id })
      .from(jogaks)
      .where(inArray(jogaks.mogakId, [...mogakIds]));
    await this.deleteJogakTree(
      tx,
      rows.map((row) => row.id),
    );
    await tx.delete(mogaks).where(inArray(mogaks.id, [...mogakIds]));
  }

  private async deleteJogakTree(
    tx: DeletionTransaction,
    jogakIds: readonly number[],
  ): Promise<void> {
    if (jogakIds.length === 0) return;
    const schedules = await tx
      .select({ id: jogakSchedules.id })
      .from(jogakSchedules)
      .where(inArray(jogakSchedules.jogakId, [...jogakIds]));
    const scheduleIds = schedules.map((schedule) => schedule.id);
    if (scheduleIds.length > 0) {
      await tx
        .delete(jogakScheduleWeekdays)
        .where(inArray(jogakScheduleWeekdays.scheduleId, scheduleIds));
      await tx.delete(jogakSchedules).where(inArray(jogakSchedules.id, scheduleIds));
    }
    await tx.delete(jogakExecutions).where(inArray(jogakExecutions.jogakId, [...jogakIds]));
    await tx.delete(jogaks).where(inArray(jogaks.id, [...jogakIds]));
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
      const [owner] = await tx
        .select({ userId: modarats.userId })
        .from(mogaks)
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .where(eq(mogaks.id, input.mogak.id));
      if (owner === undefined) throw new MogakPersistenceException('Mogak did not exist');
      await lockUsersForTransaction(tx, [owner.userId]);
      const [stillOwned] = await tx
        .select({ id: mogaks.id })
        .from(mogaks)
        .where(eq(mogaks.id, input.mogak.id));
      if (stillOwned === undefined) throw new MogakPersistenceException('Mogak did not exist');
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
    return this.db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ userId: modarats.userId })
        .from(jogaks)
        .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .where(eq(jogaks.id, input.jogakId));
      if (owner === undefined) return null;
      await lockUsersForTransaction(tx, [owner.userId]);
      const [stillOwned] = await tx
        .select({ id: jogaks.id })
        .from(jogaks)
        .where(eq(jogaks.id, input.jogakId));
      if (stillOwned === undefined) return null;
      const [execution] = await tx
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
    });
  }

  async updateExecutionStatus(input: {
    executionId: number;
    currentStatus: JogakExecutionStatus;
    desiredStatus: JogakExecutionStatus;
    now: Date;
  }): Promise<ExecutionResult | null> {
    return this.db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ userId: modarats.userId })
        .from(jogakExecutions)
        .innerJoin(jogaks, eq(jogakExecutions.jogakId, jogaks.id))
        .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
        .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
        .where(eq(jogakExecutions.id, input.executionId));
      if (owner === undefined) return null;
      await lockUsersForTransaction(tx, [owner.userId]);
      const [stillExists] = await tx
        .select({ id: jogakExecutions.id })
        .from(jogakExecutions)
        .where(eq(jogakExecutions.id, input.executionId));
      if (stillExists === undefined) return null;
      const [execution] = await tx
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
    });
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
