import { z } from 'zod';

import { MAX_PAGE_SIZE } from '@core/common';

export const positiveIdSchema = z.coerce.number().int().positive().refine(Number.isSafeInteger);

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_PAGE_SIZE)
  .refine(Number.isSafeInteger);

export const calendarDateSchema = z.iso.date();

export function requiredTextSchema(minimum: number, maximum: number) {
  return z.string().min(minimum).max(maximum).regex(/\S/);
}
