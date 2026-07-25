import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import { requiredTrimmed } from '../../common/validation/required-text';
import {
  MogaksRepository,
  type MogakRecord,
  type ModaratRecord,
} from '../infrastructure/mogaks.repository';

const MAX_MOGAKS_PER_MODARAT = 8;

export type ModaratInput = Readonly<{ title: string; color: string }>;
export type MogakInput = Readonly<{
  modaratId: number;
  title: string;
  categoryCode?: string;
  customCategoryName?: string;
  color?: string;
}>;

@Injectable()
export class MogaksService {
  constructor(@Inject(MogaksRepository) private readonly repository: MogaksRepository) {}

  async createModarat(userId: number, input: ModaratInput): Promise<ModaratRecord> {
    return this.repository.createModarat({
      userId,
      title: requiredTrimmed(input.title),
      color: requiredTrimmed(input.color),
    });
  }

  async listModarats(userId: number): Promise<ModaratRecord[]> {
    return this.repository.listModarats(userId);
  }

  async getModarat(userId: number, modaratId: number) {
    const modarat = await this.repository.findOwnedModarat(userId, modaratId);
    if (modarat === null) throw new DomainException(AppErrorCode.MODARAT_NOT_FOUND);
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
    input: ModaratInput,
  ): Promise<ModaratRecord> {
    const updated = await this.repository.updateOwnedModarat({
      userId,
      modaratId,
      title: requiredTrimmed(input.title),
      color: requiredTrimmed(input.color),
      now: new Date(),
    });
    if (updated === null) throw new DomainException(AppErrorCode.MODARAT_NOT_FOUND);
    return updated;
  }

  async deleteModarat(userId: number, modaratId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedModarat(userId, modaratId))) {
      throw new DomainException(AppErrorCode.MODARAT_NOT_FOUND);
    }
  }

  async createMogak(userId: number, input: MogakInput) {
    await this.requireOwnedModarat(userId, input.modaratId);
    if ((await this.repository.countMogaks(input.modaratId)) >= MAX_MOGAKS_PER_MODARAT) {
      throw new DomainException(AppErrorCode.MAX_MOGAKS);
    }
    const category = await this.resolveCategory(input);
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

  async updateMogak(userId: number, mogakId: number, input: Omit<MogakInput, 'modaratId'>) {
    const category = await this.resolveCategory(input);
    const updated = await this.repository.updateOwnedMogak({
      userId,
      mogakId,
      title: requiredTrimmed(input.title),
      color: optionalTrim(input.color) ?? null,
      categoryId: category.categoryId,
      customCategoryName: category.customCategoryName,
      now: new Date(),
    });
    if (updated === null) throw new DomainException(AppErrorCode.MOGAK_NOT_FOUND);
    return toMogakResponse(updated);
  }

  async deleteMogak(userId: number, mogakId: number): Promise<void> {
    if (!(await this.repository.deleteOwnedMogak(userId, mogakId))) {
      throw new DomainException(AppErrorCode.MOGAK_NOT_FOUND);
    }
  }

  async listCategories() {
    return (await this.repository.listActiveCategories()).map(({ code, name }) => ({ code, name }));
  }

  async resolveOwnedMogak(userId: number, mogakId: number): Promise<Readonly<{ id: number }>> {
    const mogak = await this.repository.findOwnedMogak(userId, mogakId);
    if (mogak === null) throw new DomainException(AppErrorCode.MOGAK_NOT_FOUND);
    return { id: mogak.id };
  }

  private async requireOwnedModarat(userId: number, modaratId: number): Promise<void> {
    if ((await this.repository.findOwnedModarat(userId, modaratId)) === null) {
      throw new DomainException(AppErrorCode.MODARAT_NOT_FOUND);
    }
  }

  private async resolveCategory(input: {
    categoryCode?: string;
    customCategoryName?: string;
  }): Promise<Readonly<{ categoryId: number | null; customCategoryName: string | null }>> {
    const categoryCode = optionalTrim(input.categoryCode);
    const customCategoryName = optionalTrim(input.customCategoryName);
    if ((categoryCode === undefined) === (customCategoryName === undefined)) {
      throw new DomainException(AppErrorCode.INVALID_PARAMETER);
    }
    if (categoryCode !== undefined) {
      const category = await this.repository.findActiveCategoryByCode(categoryCode);
      if (category === null) throw new DomainException(AppErrorCode.MOGAK_CATEGORY_NOT_FOUND);
      return { categoryId: category.id, customCategoryName: null };
    }
    if (customCategoryName === undefined) {
      throw new DomainException(AppErrorCode.CUSTOM_CATEGORY_REQUIRED);
    }
    return { categoryId: null, customCategoryName };
  }
}

function optionalTrim(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toMogakResponse(record: MogakRecord) {
  const name = record.categoryName ?? record.customCategoryName;
  if (name === null) throw new Error('Mogak category was not populated');
  return {
    id: record.id,
    title: record.title,
    color: record.color,
    category: { code: record.categoryCode, name },
  };
}
