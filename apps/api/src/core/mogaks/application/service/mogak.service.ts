import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { requiredTrimmed } from '@core/common/validation/requiredText';
import { selectMogakCategory, validateMogakCapacity } from '../../domain/policy/mogak.policy';
import type { MogakRepositoryPort } from '../port/mogak.repository.port';
import type {
  CreateMogakCommand,
  ModaratCommand,
  PatchModaratCommand,
  PatchMogakCommand,
} from '../type/mogak.command';
import type { MogakResult, ModaratResult } from '../type/mogak.result';
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
    expectedVersion = 1,
  ): Promise<ModaratResult> {
    const updated = await this.repository.updateOwnedModarat({
      userId,
      modaratId,
      expectedVersion,
      ...(input.title === undefined ? {} : { title: requiredTrimmed(input.title) }),
      ...(input.color === undefined ? {} : { color: requiredTrimmed(input.color) }),
      now: new Date(),
    });
    if (updated === null) {
      if ((await this.repository.findOwnedModarat(userId, modaratId)) !== null) {
        throw new DomainException(DomainErrorCode.PRECONDITION_FAILED);
      }
      throw new DomainException(DomainErrorCode.MODARAT_NOT_FOUND);
    }
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

  async updateMogak(userId: number, mogakId: number, input: PatchMogakCommand, expectedVersion = 1) {
    const hasCategoryPatch =
      input.categoryCode !== undefined || input.customCategoryName !== undefined;
    const category = hasCategoryPatch ? await this.resolveCategory(input) : undefined;
    const updated = await this.repository.updateOwnedMogak({
      userId,
      mogakId,
      expectedVersion,
      ...(input.title === undefined ? {} : { title: requiredTrimmed(input.title) }),
      ...(input.color === undefined ? {} : { color: optionalTrim(input.color) ?? null }),
      ...(category === undefined
        ? {}
        : { categoryId: category.categoryId, customCategoryName: category.customCategoryName }),
      now: new Date(),
    });
    if (updated === null) {
      if ((await this.repository.findOwnedMogak(userId, mogakId)) !== null) {
        throw new DomainException(DomainErrorCode.PRECONDITION_FAILED);
      }
      throw new DomainException(DomainErrorCode.MOGAK_NOT_FOUND);
    }
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
}

function optionalTrim(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toMogakResponse(record: MogakResult) {
  const name = record.categoryName ?? record.customCategoryName;
  if (name === null) throw new Error('Mogak category was not populated');
  return {
    id: record.id,
    title: record.title,
    color: record.color,
    version: record.version,
    category: { code: record.categoryCode, name },
  };
}
