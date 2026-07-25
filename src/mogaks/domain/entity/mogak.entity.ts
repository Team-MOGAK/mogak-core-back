export const MAX_MOGAKS_PER_MODARAT = 8;

export type MogakCategory = Readonly<{
  id: number;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

export type Mogak = Readonly<{
  id: number;
  modaratId: number;
  categoryId: number | null;
  customCategoryName: string | null;
  title: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type MogakCategorySelection =
  Readonly<{ type: 'OFFICIAL'; code: string }> | Readonly<{ type: 'CUSTOM'; name: string }>;

export function validateMogakCapacity(existingCount: number): boolean {
  return existingCount < MAX_MOGAKS_PER_MODARAT;
}

export function selectMogakCategory(
  input: Readonly<{
    categoryCode?: string;
    customCategoryName?: string;
  }>,
): MogakCategorySelection {
  const categoryCode = optionalTrim(input.categoryCode);
  const customCategoryName = optionalTrim(input.customCategoryName);
  if ((categoryCode === undefined) === (customCategoryName === undefined)) {
    throw new RangeError('exactly one category must be selected');
  }
  if (categoryCode !== undefined) return { type: 'OFFICIAL', code: categoryCode };
  return { type: 'CUSTOM', name: customCategoryName! };
}

function optionalTrim(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
