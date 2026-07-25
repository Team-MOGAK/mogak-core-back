import { Controller, Headers, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { successResponse } from '../../../common/http/api-response';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { DomainException } from '../../../common/http/domain.exception';
import { ZodBody, ZodParams } from '../../../common/validation/zod-parameter.decorator';
import { AuthService } from '../../application/service/auth.service';
import type { AuthenticatedPrincipal } from '../../application/type/authenticated-principal';
import type { SocialProvider } from '../../domain/entity/auth.entity';
import {
  appleLoginRequestSchema,
  providerParamsSchema,
  socialLoginRequestSchema,
  type AppleLoginRequest,
  type ProviderParams,
  type SocialLoginRequest,
} from '../type/auth.request';
import type {
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  WithdrawResponse,
} from '../type/auth.response';
import { AccessTokenGuard } from './access-token.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginApple(@ZodBody(appleLoginRequestSchema) request: AppleLoginRequest) {
    return successResponse<LoginResponse>(await this.authService.login('APPLE', request.id_token));
  }

  @Post(':provider/login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginSocial(
    @ZodParams(providerParamsSchema) params: ProviderParams,
    @ZodBody(socialLoginRequestSchema) request: SocialLoginRequest,
  ) {
    return successResponse<LoginResponse>(
      await this.authService.login(parseSocialProvider(params.provider), request.token),
    );
  }

  @Post('refresh')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async refresh(@Headers('refreshtoken') refreshToken: string | undefined) {
    return successResponse<RefreshResponse>(
      await this.authService.refresh(requiredRefreshToken(refreshToken)),
    );
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  async logout(@CurrentUser() user: AuthenticatedPrincipal) {
    await this.authService.logout(user.userId, user.sessionId);
    return successResponse<LogoutResponse>({});
  }

  @Post('withdraw')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async withdraw(@CurrentUser() user: AuthenticatedPrincipal) {
    await this.authService.withdraw(user.userId);
    return successResponse<WithdrawResponse>({ isDeleted: true });
  }
}

function parseSocialProvider(value: string): SocialProvider {
  const provider = value.toUpperCase();
  if (provider === 'APPLE' || provider === 'GOOGLE' || provider === 'KAKAO') return provider;
  throw new DomainException(AppErrorCode.UNSUPPORTED_SOCIAL_PROVIDER);
}

function requiredRefreshToken(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0)
    throw new DomainException(AppErrorCode.EMPTY_TOKEN);
  return value;
}
