import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsPositive, ValidateNested } from 'class-validator';

import { successResponse } from '../../../common/http/api-response';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { ConsentService } from '../application/consent.service';

class ConsentAgreementRequest {
  @IsInt()
  @IsPositive()
  consentItemId!: number;

  @IsBoolean()
  agreed!: boolean;
}

class UserConsentUpdateRequest {
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConsentAgreementRequest)
  consents?: ConsentAgreementRequest[];
}

class MarketingConsentPatchRequest {
  @IsOptional()
  @IsBoolean()
  marketingAgreed?: boolean;

  @IsOptional()
  @IsBoolean()
  advertisementAgreed?: boolean;
}

@Controller('api')
export class ConsentController {
  constructor(@Inject(ConsentService) private readonly consents: ConsentService) {}

  @Get('consents')
  async list() {
    const items = await this.consents.listActive();
    return successResponse(
      items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
        required: item.required,
      })),
    );
  }

  @Get('users/marketing-consent')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async marketing(@CurrentUser() current: AuthenticatedUser) {
    return successResponse(await this.consents.getMarketing(current.userId));
  }

  @Put('users/consents')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() current: AuthenticatedUser,
    @Body() request: UserConsentUpdateRequest,
  ) {
    await this.consents.update(current.userId, request.consents ?? []);
    return successResponse({});
  }

  @Patch('users/marketing-consent')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMarketing(
    @CurrentUser() current: AuthenticatedUser,
    @Body() request: MarketingConsentPatchRequest,
  ) {
    if (request.marketingAgreed === undefined && request.advertisementAgreed === undefined) {
      throw new AppException(AppErrorCode.INVALID_PARAMETER);
    }
    return successResponse(
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
