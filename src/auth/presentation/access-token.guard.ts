import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import type { AuthenticatedUser } from '../domain/authenticated-user';
import { AuthSessionsRepository } from '../infrastructure/auth-sessions.repository';
import { TokenService } from '../infrastructure/token.service';

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuthSessionsRepository) private readonly sessions: AuthSessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request.headers.authorization);
    const user = await this.tokens.verifyAccess(token);
    const session = await this.sessions.findActiveById(user.sessionId);
    if (session === null || session.userId !== user.userId) {
      throw new DomainException(AppErrorCode.LOGOUT_TOKEN);
    }
    request.user = user;
    return true;
  }

  private bearerToken(value: string | string[] | undefined): string {
    if (value === undefined || value.length === 0) {
      throw new DomainException(AppErrorCode.EMPTY_TOKEN);
    }
    if (Array.isArray(value) || !value.startsWith('Bearer ')) {
      throw new DomainException(AppErrorCode.WRONG_TOKEN);
    }
    const token = value.slice('Bearer '.length).trim();
    if (token.length === 0) {
      throw new DomainException(AppErrorCode.EMPTY_TOKEN);
    }
    return token;
  }
}
