import { z } from 'zod';

import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '@api/common/validation/requestSchema';

export const scheduleRequestSchema = z
  .object({
    scheduleType: z.string().min(1),
    effectiveFrom: calendarDateSchema,
    effectiveTo: calendarDateSchema.optional(),
    weekdays: z.array(z.string()).optional(),
  })
  .strict();
export type ScheduleRequest = z.infer<typeof scheduleRequestSchema>;
export const dateQuerySchema = z.object({ date: calendarDateSchema }).strict();
export type DateQueryRequest = z.infer<typeof dateQuerySchema>;
export const dateRangeQuerySchema = z
  .object({ startDay: calendarDateSchema, endDay: calendarDateSchema })
  .strict();
export type DateRangeQueryRequest = z.infer<typeof dateRangeQuerySchema>;
export const createJogakRequestSchema = z
  .object({
    mogakId: positiveIdSchema,
    title: requiredTextSchema(1, 100),
    schedule: scheduleRequestSchema.optional(),
    isRoutine: z.boolean().optional(),
    days: z.array(z.string()).optional(),
    today: calendarDateSchema.optional(),
    endDate: calendarDateSchema.optional(),
  })
  .strict();
export type CreateJogakRequest = z.infer<typeof createJogakRequestSchema>;
export const updateJogakRequestSchema = z
  .object({
    title: requiredTextSchema(1, 100).optional(),
    schedule: z
      .object({
        scheduleType: z.enum(['ONCE', 'WEEKLY']),
        effectiveTo: calendarDateSchema.optional(),
        weekdays: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .refine((request) => request.title !== undefined || request.schedule !== undefined, {
    message: 'title or schedule is required',
  })
  .strict();
export type UpdateJogakRequest = z.infer<typeof updateJogakRequestSchema>;
export const mogakJogakParamSchema = z.object({ mogakId: positiveIdSchema }).strict();
export type MogakJogakParams = z.infer<typeof mogakJogakParamSchema>;
export const jogakIdParamSchema = z.object({ jogakId: positiveIdSchema }).strict();
export type JogakIdParams = z.infer<typeof jogakIdParamSchema>;
export const executionParamSchema = z
  .object({ jogakId: positiveIdSchema, scheduledDate: z.string().min(1) })
  .strict();
export type ExecutionParams = z.infer<typeof executionParamSchema>;
