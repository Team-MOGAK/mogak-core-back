import { z } from 'zod';

import { MAX_PAGE_SIZE } from '@core/common/resourceLimits';

export const positiveIdSchema = z.coerce.number().int().positive().refine(Number.isSafeInteger);

export const calendarDateSchema = z.iso.date();

export const pageNumberSchema = z.coerce.number().int().min(0).refine(Number.isSafeInteger);

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_PAGE_SIZE)
  .refine(Number.isSafeInteger);

export function pageOffsetWithinSafeInteger(page: number, size: number): boolean {
  return (
    Number.isSafeInteger(page) &&
    page >= 0 &&
    Number.isSafeInteger(size) &&
    size > 0 &&
    page <= Math.floor(Number.MAX_SAFE_INTEGER / size)
  );
}

export function requiredTextSchema(minimum: number, maximum: number) {
  return z.string().min(minimum).max(maximum).regex(/\S/);
}
