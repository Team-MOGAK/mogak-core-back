export type ModaratCommand = Readonly<{ title: string; color: string }>;
export type PatchModaratCommand = Partial<ModaratCommand>;
export type CreateMogakCommand = Readonly<{
  modaratId: number;
  title: string;
  categoryCode?: string;
  customCategoryName?: string;
  color?: string;
}>;
export type UpdateMogakCommand = Omit<CreateMogakCommand, 'modaratId'>;
export type PatchMogakCommand = Partial<UpdateMogakCommand>;
