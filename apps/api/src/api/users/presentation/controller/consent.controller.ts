import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedPrincipal } from '@core/auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '@api/auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { successResponse } from '@api/common/http/apiResponse';
import { IfMatchVersion, MergePatch } from '@api/common/http/mergePatch.decorator';
import { ZodBody } from '@api/common/validation/zodParameter.decorator';
import { ConsentService } from '@core/users/application/service/consent.service';
import {
  updateMarketingConsentRequestSchema,
  updateUserConsentRequestSchema,
  type UpdateMarketingConsentRequest,
  type UpdateUserConsentRequest,
} from '../type/consent.request';
import type { ConsentItemResponse, MarketingConsentResponse } from '../type/consent.response';

@Controller('api')
export class ConsentController {
  constructor(@Inject(ConsentService) private readonly consents: ConsentService) {}

  @Get('consents')
  async list() {
    return successResponse<ConsentItemResponse[]>(await this.consents.listActive());
  }

  @Get('users/marketing-consent')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async marketing(
    @CurrentUser() current: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const marketing = await this.consents.getMarketing(current.userId);
    response.setHeader('ETag', `"${marketing.version}"`);
    return successResponse<MarketingConsentResponse>(marketing);
  }

  @Put('users/consents')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() current: AuthenticatedPrincipal,
    @ZodBody(updateUserConsentRequestSchema) request: UpdateUserConsentRequest,
  ) {
    await this.consents.update(current.userId, request.consents ?? []);
    return successResponse({});
  }

  @MergePatch('users/marketing-consent')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMarketing(
    @CurrentUser() current: AuthenticatedPrincipal,
    @ZodBody(updateMarketingConsentRequestSchema) request: UpdateMarketingConsentRequest,
    @IfMatchVersion() expectedVersion: number,
  ) {
    return successResponse<MarketingConsentResponse>(
      await this.consents.updateMarketing(current.userId, {
        ...(request.marketingAgreed === undefined
          ? {}
          : { marketingAgreed: request.marketingAgreed }),
        ...(request.advertisementAgreed === undefined
          ? {}
          : { advertisementAgreed: request.advertisementAgreed }),
      }, expectedVersion),
    );
  }
}
