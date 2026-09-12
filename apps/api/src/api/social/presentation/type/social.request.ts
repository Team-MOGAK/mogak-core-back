import { z } from 'zod';

import {
  pageNumberSchema,
  pageOffsetWithinSafeInteger,
  pageSizeSchema,
} from '@api/common/validation/requestSchema';

export const nicknameParamsSchema = z.object({ nickname: z.string().min(1) }).strict();
export type NicknameParams = z.infer<typeof nicknameParamsSchema>;

export const pacemakerPostsQuerySchema = z
  .object({ cursor: pageNumberSchema, size: pageSizeSchema })
  .strict()
  .refine(({ cursor, size }) => pageOffsetWithinSafeInteger(cursor, size), {
    path: ['cursor'],
    message: 'cursor offset is too large',
  });
export type PacemakerPostsQueryRequest = z.infer<typeof pacemakerPostsQuerySchema>;

export const networkPostsQuerySchema = z
  .object({
    page: pageNumberSchema.default(0),
    size: pageSizeSchema,
    sort: z.enum(['createdAt', 'likeCnt']).default('createdAt'),
    address: z.string().optional(),
  })
  .strict()
  .refine(({ page, size }) => pageOffsetWithinSafeInteger(page, size), {
    path: ['page'],
    message: 'page offset is too large',
  });
export type NetworkPostsQueryRequest = z.infer<typeof networkPostsQuerySchema>;
