import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { successResponse } from '../../../common/http/api-response';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { RateLimit } from '../../../common/http/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/http/rate-limit.guard';
import { AuthService } from '../application/auth.service';
import { parseSocialProvider } from '../domain/social-provider';
import { AccessTokenGuard } from './access-token.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from '../domain/authenticated-user';

class AppleLoginRequest extends createZodDto(z.object({ id_token: z.string().min(1) }).strict()) {}

class SocialLoginRequest extends createZodDto(z.object({ token: z.string().min(1) }).strict()) {}

class ProviderParam extends createZodDto(z.object({ provider: z.string().min(1) }).strict()) {}

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  async loginApple(@Body() request: AppleLoginRequest) {
    return successResponse(await this.authService.login('APPLE', request.id_token));
  }

  @Post(':provider/login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  async loginSocial(@Param() params: ProviderParam, @Body() request: SocialLoginRequest) {
    return successResponse(
      await this.authService.login(parseSocialProvider(params.provider), request.token),
    );
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  async refresh(@Headers('refreshtoken') refreshToken: string | undefined) {
    return successResponse(await this.authService.refresh(requiredRefreshToken(refreshToken)));
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.userId, user.sessionId);
    return successResponse({});
  }

  @Post('withdraw')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async withdraw(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.withdraw(user.userId);
    return successResponse({ isDeleted: true });
  }
}

function requiredRefreshToken(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new AppException(AppErrorCode.EMPTY_TOKEN);
  }
  return value;
}
