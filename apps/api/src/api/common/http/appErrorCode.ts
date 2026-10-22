import type { HttpStatus } from '@nestjs/common';

import { AppErrorCode as SharedAppErrorCode } from '@mogak/shared';
import type { DomainErrorCode } from '@core/common/error/domainErrorCode';

/**
 * Compatibility type for API callers. The canonical values live in
 * @mogak/shared; this local type keeps Nest's HttpStatus constraint visible at
 * the existing API boundary.
 */
export type ErrorDefinition = Readonly<{
  httpStatus: HttpStatus;
  code: string;
  message: string;
}>;

export const AppErrorCode = SharedAppErrorCode satisfies Record<
  DomainErrorCode | 'UNSUPPORTED_MEDIA_TYPE',
  ErrorDefinition
>;

type AppErrorCodeValue = (typeof AppErrorCode)[keyof typeof AppErrorCode];

type ApiErrorDefinition<Value> = Value extends { httpStatus: HttpStatus }
  ? Omit<Value, 'httpStatus'> & Pick<ErrorDefinition, 'httpStatus'>
  : never;

export type AppErrorCode = ApiErrorDefinition<AppErrorCodeValue>;
