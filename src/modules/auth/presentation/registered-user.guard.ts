import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AuthenticatedUser } from '../domain/authenticated-user';

type AuthenticatedRequest = {
  user?: AuthenticatedUser;
};

@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== 'USER') {
      throw new AppException(AppErrorCode.FORBIDDEN);
    }
    return true;
  }
}
