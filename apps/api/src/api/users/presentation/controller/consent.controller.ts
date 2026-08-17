import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../../../../core/auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '../../../auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '../../../auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '../../../auth/presentation/controller/registeredUser.guard';
import { successResponse } from '../../../common/http/apiResponse';
import { ZodBody } from '../../../common/validation/zodParameter.decorator';
import { ConsentService } from '../../../../core/users/application/service/consent.service';
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
  async marketing(@CurrentUser() current: AuthenticatedPrincipal) {
    return successResponse<MarketingConsentResponse>(
      await this.consents.getMarketing(current.userId),
    );
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

  @Patch('users/marketing-consent')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMarketing(
    @CurrentUser() current: AuthenticatedPrincipal,
    @ZodBody(updateMarketingConsentRequestSchema) request: UpdateMarketingConsentRequest,
  ) {
    return successResponse<MarketingConsentResponse>(
      await this.consents.updateMarketing(current.userId, {
        ...(request.marketingAgreed === undefined
          ? {}
          : { marketingAgreed: request.marketingAgreed }),
        ...(request.advertisementAgreed === undefined
          ? {}
          : { advertisementAgreed: request.advertisementAgreed }),
      }),
    );
  }
}
