import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/appErrorCode';
import { DomainException } from '../../../common/http/domain.exception';
import { AuthService } from '../../../../core/auth/application/service/auth.service';
import type { AuthenticatedPrincipal } from '../../../../core/auth/application/type/authenticatedPrincipal';

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedPrincipal;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.authService.authenticateAccessToken(
      this.bearerToken(request.headers.authorization),
    );
    return true;
  }

  private bearerToken(value: string | string[] | undefined): string {
    if (value === undefined || value.length === 0)
      throw new DomainException(AppErrorCode.EMPTY_TOKEN);
    if (Array.isArray(value) || !value.startsWith('Bearer '))
      throw new DomainException(AppErrorCode.WRONG_TOKEN);
    const token = value.slice('Bearer '.length).trim();
    if (token.length === 0) throw new DomainException(AppErrorCode.EMPTY_TOKEN);
    return token;
  }
}
