import type { MergePatch } from '@core/common/type/mergePatch';

export type ModaratCommand = Readonly<{ title: string; color: string }>;
export type PatchModaratCommand = MergePatch<ModaratCommand>;
export type CreateMogakCommand = Readonly<{
  modaratId: number;
  title: string;
  categoryCode?: string;
  customCategoryName?: string;
  color?: string;
}>;
export type MogakCategoryPatch =
  Readonly<{ type: 'SYSTEM'; code: string }> | Readonly<{ type: 'CUSTOM'; name: string }>;
export type PatchMogakCommand = MergePatch<
  Readonly<{ title: string; color: string; category: MogakCategoryPatch }>
>;
