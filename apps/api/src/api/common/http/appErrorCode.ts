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

// Keep the domain registry check at the API boundary without copying the
// registry. Shared uses numeric HTTP literals so it remains framework-free.
type ApiErrorRegistry = {
  readonly [Key in keyof typeof SharedAppErrorCode]: Readonly<{
    httpStatus: HttpStatus;
    code: (typeof SharedAppErrorCode)[Key]['code'];
    message: (typeof SharedAppErrorCode)[Key]['message'];
  }>;
};

export const AppErrorCode: ApiErrorRegistry = SharedAppErrorCode satisfies Record<
  DomainErrorCode | 'UNSUPPORTED_MEDIA_TYPE',
  ErrorDefinition
>;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];
