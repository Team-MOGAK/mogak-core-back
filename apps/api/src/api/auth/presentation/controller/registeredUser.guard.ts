import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/appErrorCode';
import { DomainException } from '../../../common/http/domain.exception';
import type { AuthenticatedPrincipal } from '../../../../core/auth/application/type/authenticatedPrincipal';

@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedPrincipal }>();
    if (request.user?.role !== 'USER') throw new DomainException(AppErrorCode.FORBIDDEN);
    return true;
  }
}
