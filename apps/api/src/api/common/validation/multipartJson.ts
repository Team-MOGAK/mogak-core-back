import type { z } from 'zod';

import { AppErrorCode } from '../http/appErrorCode';
import { DomainException } from '../http/domain.exception';

export function parseMultipartJson<TSchema extends z.ZodType>(
  body: unknown,
  schema: TSchema,
): z.output<TSchema> {
  const input = isMultipartBody(body) ? parseJson(body.request) : body;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
  return parsed.data;
}

function isMultipartBody(value: unknown): value is Readonly<{ request: string }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'request' in value &&
    typeof value.request === 'string'
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
}
