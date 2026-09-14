import { z } from 'zod';

import { pageSizeSchema } from '@api/common/validation/requestSchema';

export const nicknameParamsSchema = z.object({ nickname: z.string().min(1) }).strict();
export type NicknameParams = z.infer<typeof nicknameParamsSchema>;

export const pacemakerPostsQuerySchema = z
  .object({ cursor: z.coerce.number().int().min(0), size: pageSizeSchema })
  .strict();
export type PacemakerPostsQueryRequest = z.infer<typeof pacemakerPostsQuerySchema>;

export const networkPostsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(0).default(0),
    size: pageSizeSchema,
    sort: z.enum(['createdAt', 'likeCnt']).default('createdAt'),
    address: z.string().optional(),
  })
  .strict();
export type NetworkPostsQueryRequest = z.infer<typeof networkPostsQuerySchema>;
