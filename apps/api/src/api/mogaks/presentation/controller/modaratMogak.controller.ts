import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedPrincipal as AuthenticatedUser } from '@core/auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '@api/auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { successResponse } from '@api/common/http/apiResponse';
import { ZodBody, ZodParams } from '@api/common/validation/zodParameter.decorator';
import { MogakService } from '@core/mogaks/application/service/mogak.service';
import {
  moderatIdParamSchema,
  moderatRequestSchema,
  mogakIdParamSchema,
  mogakRequestSchema,
  mogakUpdateRequestSchema,
  type ModaratIdParams,
  type ModaratRequest,
  type MogakIdParams,
  type MogakRequest,
  type MogakUpdateRequest,
} from '../type/mogak.request';

@Controller('api')
export class ModaratMogakController {
  constructor(@Inject(MogakService) private readonly mogakService: MogakService) {}

  @Post('modarats')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async createModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(moderatRequestSchema) request: ModaratRequest,
  ) {
    return successResponse(
      await this.mogakService.createModarat(user.userId, {
        title: request.title,
        color: request.color,
      }),
      HttpStatus.CREATED,
    );
  }

  @Get('modarats')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listModarats(@CurrentUser() user: AuthenticatedUser) {
    return successResponse(await this.mogakService.listModarats(user.userId));
  }

  @Get('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
  ) {
    return successResponse(await this.mogakService.getModarat(user.userId, params.modaratId));
  }

  @Put('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
    @ZodBody(moderatRequestSchema) request: ModaratRequest,
  ) {
    return successResponse(
      await this.mogakService.updateModarat(user.userId, params.modaratId, {
        title: request.title,
        color: request.color,
      }),
    );
  }

  @Delete('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async deleteModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
  ) {
    await this.mogakService.deleteModarat(user.userId, params.modaratId);
  }

  @Post('mogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async createMogak(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(mogakRequestSchema) request: MogakRequest,
  ) {
    return successResponse(
      await this.mogakService.createMogak(user.userId, {
        modaratId: request.modaratId,
        title: request.title,
        ...(request.categoryCode === undefined ? {} : { categoryCode: request.categoryCode }),
        ...(request.customCategoryName === undefined
          ? {}
          : { customCategoryName: request.customCategoryName }),
        ...(request.color === undefined ? {} : { color: request.color }),
      }),
      HttpStatus.CREATED,
    );
  }

  @Get('modarats/:modaratId/mogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listMogaks(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
  ) {
    return successResponse(await this.mogakService.listMogaks(user.userId, params.modaratId));
  }

  @Put('mogaks/:mogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMogak(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(mogakIdParamSchema) params: MogakIdParams,
    @ZodBody(mogakUpdateRequestSchema) request: MogakUpdateRequest,
  ) {
    return successResponse(
      await this.mogakService.updateMogak(user.userId, params.mogakId, {
        title: request.title,
        ...(request.categoryCode === undefined ? {} : { categoryCode: request.categoryCode }),
        ...(request.customCategoryName === undefined
          ? {}
          : { customCategoryName: request.customCategoryName }),
        ...(request.color === undefined ? {} : { color: request.color }),
      }),
    );
  }

  @Delete('mogaks/:mogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async deleteMogak(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(mogakIdParamSchema) params: MogakIdParams,
  ) {
    await this.mogakService.deleteMogak(user.userId, params.mogakId);
    return successResponse({});
  }
}
