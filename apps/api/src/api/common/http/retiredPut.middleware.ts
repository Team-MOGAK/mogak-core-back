import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AppErrorCode } from './appErrorCode';
import { errorResponse } from './apiResponse';

const retiredPutPaths = [/^\/api\/modarats\/\d+\/?$/, /^\/api\/mogaks\/\d+\/?$/] as const;

/** Rejects only the explicitly retired replacement routes; all other PUT routes remain live. */
export function rejectRetiredPutRoutes(request: Request, response: Response, next: NextFunction): void {
  if (
    request.method === 'PUT' &&
    retiredPutPaths.some((path) => path.test(request.path))
  ) {
    response
      .setHeader('Allow', 'PATCH')
      .status(HttpStatus.METHOD_NOT_ALLOWED)
      .json(errorResponse(AppErrorCode.METHOD_NOT_ALLOWED));
    return;
  }
  next();
}
