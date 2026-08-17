import { Body, Param, Query, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { DomainException } from '@core/common/error/domainException';

export const zodParsePipe = <TSchema extends z.ZodType>(
  schema: TSchema,
): PipeTransform<unknown, z.output<TSchema>> => ({
  transform(value) {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new DomainException('INVALID_PARAMETER');
    }

    return result.data;
  },
});

export const ZodBody = <TSchema extends z.ZodType>(schema: TSchema): ParameterDecorator =>
  Body(zodParsePipe(schema));

export const ZodQuery = <TSchema extends z.ZodType>(schema: TSchema): ParameterDecorator =>
  Query(zodParsePipe(schema));

export const ZodParams = <TSchema extends z.ZodType>(schema: TSchema): ParameterDecorator =>
  Param(zodParsePipe(schema));
