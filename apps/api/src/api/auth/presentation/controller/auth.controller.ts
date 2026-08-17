import { Controller, Headers, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { successResponse } from '@api/common/http/apiResponse';
import { DomainException } from '@core/common/error/domainException';
import { ZodBody, ZodParams } from '@api/common/validation/zodParameter.decorator';
import { AuthService } from '@core/auth/application/service/auth.service';
import type { AuthenticatedPrincipal } from '@core/auth/application/type/authenticatedPrincipal';
import { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import {
  providerParamsSchema,
  socialLoginRequestSchema,
  type ProviderParams,
  type SocialLoginRequest,
} from '../type/auth.request';
import type {
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  WithdrawResponse,
} from '../type/auth.response';
import { AccessTokenGuard } from './accessToken.guard';
import { CurrentUser } from './currentUser.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post(':provider/login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginSocial(
    @ZodParams(providerParamsSchema) params: ProviderParams,
    @ZodBody(socialLoginRequestSchema) request: SocialLoginRequest,
  ) {
    const provider = params.provider.toUpperCase();
    switch (provider) {
      case SocialProvider.APPLE:
      case SocialProvider.GOOGLE:
      case SocialProvider.KAKAO:
        return successResponse<LoginResponse>(
          await this.authService.login(provider, request.token),
        );
      default:
        throw new DomainException('UNSUPPORTED_SOCIAL_PROVIDER');
    }
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

function requiredRefreshToken(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) throw new DomainException('EMPTY_TOKEN');
  return value;
}
