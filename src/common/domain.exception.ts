import { HttpException } from '@nestjs/common';

import type { AppErrorCode } from './http/appErrorCode';

export class DomainException extends HttpException {
  constructor(readonly errorCode: AppErrorCode) {
    super(errorCode.message, errorCode.httpStatus);
  }
}
