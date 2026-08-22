import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedPrincipal as AuthenticatedUser } from '@core/auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '@api/auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { successResponse } from '@api/common/http/apiResponse';
import { MergePatch } from '@api/common/http/mergePatch.decorator';
import { ZodBody, ZodParams } from '@api/common/validation/zodParameter.decorator';
import { MogakService } from '@core/mogaks/application/service/mogak.service';
import {
  moderatIdParamSchema,
  moderatPatchRequestSchema,
  moderatRequestSchema,
  mogakIdParamSchema,
  mogakRequestSchema,
  mogakPatchRequestSchema,
  type ModaratIdParams,
  type ModaratPatchRequest,
  type ModaratRequest,
  type MogakIdParams,
  type MogakRequest,
  type MogakPatchRequest,
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

  @MergePatch('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
    @ZodBody(moderatPatchRequestSchema) request: ModaratPatchRequest,
  ) {
    return successResponse(
      await this.mogakService.updateModarat(user.userId, params.modaratId, {
        ...(request.title === undefined ? {} : { title: request.title }),
        ...(request.color === undefined ? {} : { color: request.color }),
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

  @MergePatch('mogaks/:mogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMogak(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(mogakIdParamSchema) params: MogakIdParams,
    @ZodBody(mogakPatchRequestSchema) request: MogakPatchRequest,
  ) {
    return successResponse(
      await this.mogakService.updateMogak(user.userId, params.mogakId, {
        ...(request.title === undefined ? {} : { title: request.title }),
        ...(request.color === undefined ? {} : { color: request.color }),
        ...(request.category === undefined
          ? {}
          : request.category.code === undefined
            ? request.category.name === undefined
              ? {}
              : { customCategoryName: request.category.name }
            : { categoryCode: request.category.code }),
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
