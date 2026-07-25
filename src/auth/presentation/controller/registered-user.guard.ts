import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { DomainException } from '../../../common/http/domain.exception';
import type { AuthenticatedPrincipal } from '../../application/type/authenticated-principal';

@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedPrincipal }>();
    if (request.user?.role !== 'USER') throw new DomainException(AppErrorCode.FORBIDDEN);
    return true;
  }
}
