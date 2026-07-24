import { z } from 'zod';

export const positiveIdSchema = z.coerce.number().int().positive().refine(Number.isSafeInteger);

export const calendarDateSchema = z.iso.date();

export function requiredTextSchema(minimum: number, maximum: number) {
  return z.string().min(minimum).max(maximum).regex(/\S/);
}
