import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { MogakException } from '../../domain/exception/mogak.exception';
import { patchText, requiredTrimmed } from '@core/common/validation/requiredText';
import { MogakPersistenceException } from '../../domain/exception/mogakPersistence.exception';
import { datesInclusive } from '../../domain/policy/jogakSchedule.policy';
import { isDateOnly, weekdayFor } from '../../domain/vo/jogakScheduleDate.vo';
import { selectMogakCategory, validateMogakCapacity } from '../../domain/policy/mogak.policy';
import type { MogakRepositoryPort } from '../port/mogak.repository.port';
import type {
  CreateMogakCommand,
  ModaratCommand,
  PatchModaratCommand,
  PatchMogakCommand,
} from '../type/mogak.command';
import type {
  MogakResult,
  ModaratProgressResult,
  ModaratResult,
  ProgressCounts,
} from '../type/mogak.result';
import type { OwnedMogakPort } from '../port/ownedMogak.port';

export class MogakService implements OwnedMogakPort {
  constructor(private readonly repository: MogakRepositoryPort) {}

  async createModarat(userId: number, input: ModaratCommand): Promise<ModaratResult> {
    return this.repository.createModarat({
      userId,
      title: requiredTrimmed(input.title),
      color: requiredTrimmed(input.color),
    });
  }

  async listModarats(userId: number): Promise<ModaratResult[]> {
    return this.repository.listModarats(userId);
  }

  async getProgress(
    userId: number,
    modaratId: number,
    date: string,
  ): Promise<ModaratProgressResult> {
    if (!isDateOnly(date)) throw new DomainException(DomainErrorCode.INVALID_TARGET_DATE);
    await this.requireOwnedModarat(userId, modaratId);
    const { weekStart, weekEnd, dates } = weekContaining(date);
    const mogaks = await this.repository.listMogaksForOwnedModarat(userId, modaratId);
    const jogakParents = await this.repository.listJogakParentsForOwnedModarat(userId, modaratId);
    const jogakIds = jogakParents.map(({ jogakId }) => jogakId);
    const mogakIdByJogak = new Map(jogakParents.map(({ jogakId, mogakId }) => [jogakId, mogakId]));
    const scheduleRows = await this.repository.listOccurrenceScheduleRows({
      userId,
      modaratId,
      startDate: weekStart,
      endDate: weekEnd,
    });
    const executions = await this.repository.listExecutionsForJogaks(jogakIds, weekStart, weekEnd);

    const plannedByMogak = new Map(mogaks.map(({ id }) => [id, new Set<string>()]));
    const scheduledKeys = new Set<string>();
    for (const row of scheduleRows) {
      if (
        (row.scheduleType === 'ONCE' && row.weekday !== null) ||
        (row.scheduleType === 'WEEKLY' && row.weekday === null)
      ) {
        throw new MogakPersistenceException(`Invalid persisted Jogak schedule ${row.scheduleId}`);
      }
      for (const occurrenceDate of dates) {
        if (
          occurrenceDate < row.effectiveFrom ||
          (row.effectiveTo !== null && occurrenceDate > row.effectiveTo)
        ) {
          continue;
        }
        if (
          row.scheduleType === 'ONCE'
            ? occurrenceDate !== row.effectiveFrom
            : row.weekday === null || weekdayFor(occurrenceDate) !== row.weekday
        ) {
          continue;
        }
        const key = occurrenceKey(row.jogakId, occurrenceDate);
        scheduledKeys.add(key);
        plannedByMogak.get(row.mogakId)?.add(key);
      }
    }

    const doneByMogak = new Map(mogaks.map(({ id }) => [id, new Set<string>()]));
    for (const execution of executions) {
      const key = occurrenceKey(execution.jogakId, execution.scheduledDate);
      const executionMogakId = mogakIdByJogak.get(execution.jogakId);
      if (executionMogakId === undefined) continue;
      if (!scheduledKeys.has(key)) {
        plannedByMogak.get(executionMogakId)?.add(key);
      }
      if (execution.status === 'SUCCESS') {
        doneByMogak.get(executionMogakId)?.add(key);
      }
    }

    const mogakProgress = mogaks.map(({ id }) => ({
      mogakId: id,
      ...progressCounts(plannedByMogak.get(id)!, doneByMogak.get(id)!),
    }));
    const plannedKeys = new Set(
      mogakProgress.flatMap(({ mogakId }) => [...plannedByMogak.get(mogakId)!]),
    );
    const doneKeys = new Set(
      mogakProgress.flatMap(({ mogakId }) => [...doneByMogak.get(mogakId)!]),
    );
    return {
      weekStart,
      ...progressCounts(plannedKeys, doneKeys),
      mogaks: mogakProgress,
    };
  }

  async getModarat(userId: number, modaratId: number) {
    const modarat = await this.repository.findOwnedModarat(userId, modaratId);
    if (modarat === null) throw new DomainException(DomainErrorCode.MODARAT_NOT_FOUND);
    return {
      ...modarat,
      mogaks: (await this.repository.listMogaksForOwnedModarat(userId, modaratId)).map(
        toMogakResponse,
      ),
    };
  }

  async updateModarat(
    userId: number,
    modaratId: number,
    input: PatchModaratCommand,
  ): Promise<ModaratResult> {
    const updated = await this.repository.updateOwnedModarat({
      userId,
      modaratId,
      title: patchText(input.title),
      color: patchText(input.color),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(DomainErrorCode.MODARAT_NOT_FOUND);
    return updated;
  }

  async deleteModarat(userId: number, modaratId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedModarat(userId, modaratId))) {
      throw new DomainException(DomainErrorCode.MODARAT_NOT_FOUND);
    }
  }

  async createMogak(userId: number, input: CreateMogakCommand) {
    const category = await this.resolveCategory(input);
    await this.requireOwnedModarat(userId, input.modaratId);
    if (!validateMogakCapacity(await this.repository.countMogaks(input.modaratId))) {
      throw new DomainException(DomainErrorCode.MAX_MOGAKS);
    }
    return toMogakResponse(
      await this.repository.createMogak({
        modaratId: input.modaratId,
        title: requiredTrimmed(input.title),
        color: optionalTrim(input.color) ?? null,
        categoryId: category.categoryId,
        customCategoryName: category.customCategoryName,
      }),
    );
  }

  async listMogaks(userId: number, modaratId: number) {
    await this.requireOwnedModarat(userId, modaratId);
    const mogaks = await this.repository.listMogaksForOwnedModarat(userId, modaratId);
    return { mogaks: mogaks.map(toMogakResponse), size: mogaks.length };
  }

  async updateMogak(userId: number, mogakId: number, input: PatchMogakCommand) {
    const category =
      input.category === undefined ? undefined : await this.resolvePatchCategory(input.category);
    const updated = await this.repository.updateOwnedMogak({
      userId,
      mogakId,
      title: patchText(input.title),
      color: nullableOptionalTrim(input.color),
      categoryId: category?.categoryId,
      customCategoryName: category?.customCategoryName,
      now: new Date(),
    });
    if (updated === null) throw new DomainException(DomainErrorCode.MOGAK_NOT_FOUND);
    return toMogakResponse(updated);
  }

  async deleteMogak(userId: number, mogakId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedMogak(userId, mogakId))) {
      throw new DomainException(DomainErrorCode.MOGAK_NOT_FOUND);
    }
  }

  async listCategories() {
    return (await this.repository.listActiveCategories()).map(({ code, name }) => ({ code, name }));
  }

  async resolveOwnedMogak(userId: number, mogakId: number): Promise<Readonly<{ id: number }>> {
    const mogak = await this.repository.findOwnedMogak(userId, mogakId);
    if (mogak === null) throw new DomainException(DomainErrorCode.MOGAK_NOT_FOUND);
    return { id: mogak.id };
  }

  private async requireOwnedModarat(userId: number, modaratId: number): Promise<void> {
    if ((await this.repository.findOwnedModarat(userId, modaratId)) === null) {
      throw new DomainException(DomainErrorCode.MODARAT_NOT_FOUND);
    }
  }

  private async resolveCategory(
    input: Pick<CreateMogakCommand, 'categoryCode' | 'customCategoryName'>,
  ): Promise<Readonly<{ categoryId: number | null; customCategoryName: string | null }>> {
    let selection;
    try {
      selection = selectMogakCategory(input);
    } catch {
      throw new DomainException(DomainErrorCode.INVALID_PARAMETER);
    }
    if (selection.type === 'OFFICIAL') {
      const category = await this.repository.findActiveCategoryByCode(selection.code);
      if (category === null) throw new DomainException(DomainErrorCode.MOGAK_CATEGORY_NOT_FOUND);
      return { categoryId: category.id, customCategoryName: null };
    }
    return { categoryId: null, customCategoryName: selection.name };
  }

  private resolvePatchCategory(input: NonNullable<PatchMogakCommand['category']>) {
    return this.resolveCategory(
      input.type === 'SYSTEM' ? { categoryCode: input.code } : { customCategoryName: input.name },
    );
  }
}

function optionalTrim(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function nullableOptionalTrim(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : (optionalTrim(value) ?? null);
}

function toMogakResponse(record: MogakResult) {
  const name = record.categoryName ?? record.customCategoryName;
  if (name === null) throw new MogakException('Mogak category was not populated');
  return {
    id: record.id,
    title: record.title,
    color: record.color,
    category: { code: record.categoryCode, name },
  };
}

function weekContaining(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const weekStart = start.toISOString().slice(0, 10);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  return { weekStart, weekEnd, dates: datesInclusive(weekStart, weekEnd) };
}

function occurrenceKey(jogakId: number, date: string) {
  return `${jogakId}:${date}`;
}

function progressCounts(planned: ReadonlySet<string>, done: ReadonlySet<string>): ProgressCounts {
  const plannedCount = planned.size;
  const doneCount = done.size;
  return {
    plannedCount,
    doneCount,
    percent: plannedCount === 0 ? 0 : Math.round((doneCount / plannedCount) * 100),
  };
}
