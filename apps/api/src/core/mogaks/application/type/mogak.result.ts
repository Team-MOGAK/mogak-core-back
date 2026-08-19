export type ModaratResult = Readonly<{ id: number; title: string; color: string; version?: number }>;
export type MogakResult = Readonly<{
  id: number;
  modaratId: number;
  title: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  version?: number;
}>;
export type MogakCategoryResult = Readonly<{ id: number; code: string; name: string }>;
