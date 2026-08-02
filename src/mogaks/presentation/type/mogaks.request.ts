import { z } from 'zod';

import { positiveIdSchema, requiredTextSchema } from '../../../common/validation/requestSchema';

export const moderatRequestSchema = z
  .object({ title: requiredTextSchema(1, 100), color: requiredTextSchema(1, 100) })
  .strict();
export type ModaratRequest = z.infer<typeof moderatRequestSchema>;
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
export const mogakUpdateRequestSchema = mogakRequestSchema.omit({ modaratId: true });
export type MogakUpdateRequest = z.infer<typeof mogakUpdateRequestSchema>;
export const moderatIdParamSchema = z.object({ modaratId: positiveIdSchema }).strict();
export type ModaratIdParams = z.infer<typeof moderatIdParamSchema>;
export const mogakIdParamSchema = z.object({ mogakId: positiveIdSchema }).strict();
export type MogakIdParams = z.infer<typeof mogakIdParamSchema>;
