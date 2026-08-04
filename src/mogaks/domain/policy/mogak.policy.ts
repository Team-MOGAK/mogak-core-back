import type { MogakCategorySelection } from '../vo/mogakCategorySelection.vo';

export const MAX_MOGAKS_PER_MODARAT = 8;

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
