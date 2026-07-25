import { z } from 'zod';

import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '../../../common/validation/request-schema';

export const createPostRequestSchema = z
  .object({ targetDate: calendarDateSchema, contents: requiredTextSchema(1, 350) })
  .strict();
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;

export const createPostTransportSchema = z
  .object({
    targetDate: z.unknown().optional(),
    contents: z.unknown().optional(),
    request: z.string().optional(),
  })
  .strict();
export type CreatePostTransportRequest = z.infer<typeof createPostTransportSchema>;

export const updatePostRequestSchema = z.object({ contents: requiredTextSchema(1, 350) }).strict();
export type UpdatePostRequest = z.infer<typeof updatePostRequestSchema>;
export const commentRequestSchema = z.object({ contents: requiredTextSchema(1, 200) }).strict();
export type CommentRequest = z.infer<typeof commentRequestSchema>;
export const likePostRequestSchema = z.object({ postId: positiveIdSchema }).strict();
export type LikePostRequest = z.infer<typeof likePostRequestSchema>;
export const postDateQuerySchema = z.object({ targetDate: calendarDateSchema }).strict();
export type PostDateQuery = z.infer<typeof postDateQuerySchema>;
export const postPageQuerySchema = z
  .object({ page: z.coerce.number().int().min(0).default(0), size: positiveIdSchema })
  .strict();
export type PostPageQuery = z.infer<typeof postPageQuerySchema>;
export const jogakIdParamsSchema = z.object({ jogakId: positiveIdSchema }).strict();
export type JogakIdParams = z.infer<typeof jogakIdParamsSchema>;
export const mogakIdParamsSchema = z.object({ mogakId: positiveIdSchema }).strict();
export type MogakIdParams = z.infer<typeof mogakIdParamsSchema>;
export const postIdParamsSchema = z.object({ postId: positiveIdSchema }).strict();
export type PostIdParams = z.infer<typeof postIdParamsSchema>;
export const postCommentParamsSchema = z
  .object({ postId: positiveIdSchema, commentId: positiveIdSchema })
  .strict();
export type PostCommentParams = z.infer<typeof postCommentParamsSchema>;
