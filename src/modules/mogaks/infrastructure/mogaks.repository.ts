import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { modarats, mogakCategories, mogaks } from '../../../database/schema';

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
