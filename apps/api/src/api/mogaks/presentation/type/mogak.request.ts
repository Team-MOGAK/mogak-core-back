import { z } from 'zod';

import { positiveIdSchema, requiredTextSchema } from '@api/common/validation/requestSchema';

export const moderatRequestSchema = z
  .object({ title: requiredTextSchema(1, 100), color: requiredTextSchema(1, 100) })
  .strict();
export type ModaratRequest = z.infer<typeof moderatRequestSchema>;
export const moderatPatchRequestSchema = moderatRequestSchema
  .partial()
  .refine((value) => value.title !== undefined || value.color !== undefined);
export type ModaratPatchRequest = z.infer<typeof moderatPatchRequestSchema>;
export const mogakRequestSchema = z
  .object({
    modaratId: positiveIdSchema,
    title: requiredTextSchema(1, 100),
    categoryCode: z.string().min(1).max(100).optional(),
    customCategoryName: z.string().min(1).max(200).optional(),
    color: z.string().min(4).max(10).optional(),
  })
  .strict();
export type MogakRequest = z.infer<typeof mogakRequestSchema>;
const mogakCategoryPatchSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SYSTEM'), code: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal('CUSTOM'), name: z.string().min(1).max(200) }).strict(),
]);
export const mogakPatchRequestSchema = z
  .object({
    title: requiredTextSchema(1, 100).optional(),
    color: z.string().min(4).max(10).optional(),
    category: mogakCategoryPatchSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined || value.color !== undefined || value.category !== undefined,
  );
export type MogakPatchRequest = z.infer<typeof mogakPatchRequestSchema>;
export const moderatIdParamSchema = z.object({ modaratId: positiveIdSchema }).strict();
export type ModaratIdParams = z.infer<typeof moderatIdParamSchema>;
export const mogakIdParamSchema = z.object({ mogakId: positiveIdSchema }).strict();
export type MogakIdParams = z.infer<typeof mogakIdParamSchema>;
