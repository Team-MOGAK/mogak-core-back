export type ModaratResult = Readonly<{ id: number; title: string; color: string }>;
export type MogakResult = Readonly<{
  id: number;
  modaratId: number;
  title: string;
  color: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
}>;
export type MogakCategoryResult = Readonly<{ id: number; code: string; name: string }>;
