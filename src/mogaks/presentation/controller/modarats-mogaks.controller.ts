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
import type { AuthenticatedPrincipal as AuthenticatedUser } from '../../../auth/application/type/authenticated-principal';
import { AccessTokenGuard } from '../../../auth/presentation/controller/access-token.guard';
import { CurrentUser } from '../../../auth/presentation/controller/current-user.decorator';
import { RegisteredUserGuard } from '../../../auth/presentation/controller/registered-user.guard';
import { successResponse } from '../../../common/http/api-response';
import { ZodBody, ZodParams } from '../../../common/validation/zod-parameter.decorator';
import { MogaksService } from '../../application/service/mogaks.service';
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
} from '../type/mogaks.request';

@Controller('api')
export class ModaratsMogaksController {
  constructor(@Inject(MogaksService) private readonly mogaks: MogaksService) {}

  @Post('modarats')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async createModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(moderatRequestSchema) request: ModaratRequest,
  ) {
    return successResponse(
      await this.mogaks.createModarat(user.userId, { title: request.title, color: request.color }),
      HttpStatus.CREATED,
    );
  }

  @Get('modarats')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listModarats(@CurrentUser() user: AuthenticatedUser) {
    return successResponse(await this.mogaks.listModarats(user.userId));
  }

  @Get('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
  ) {
    return successResponse(await this.mogaks.getModarat(user.userId, params.modaratId));
  }

  @Put('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateModarat(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(moderatIdParamSchema) params: ModaratIdParams,
    @ZodBody(moderatRequestSchema) request: ModaratRequest,
  ) {
    return successResponse(
      await this.mogaks.updateModarat(user.userId, params.modaratId, {
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
    await this.mogaks.deleteModarat(user.userId, params.modaratId);
  }

  @Post('mogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async createMogak(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(mogakRequestSchema) request: MogakRequest,
  ) {
    return successResponse(
      await this.mogaks.createMogak(user.userId, {
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
    return successResponse(await this.mogaks.listMogaks(user.userId, params.modaratId));
  }

  @Put('mogaks/:mogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMogak(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(mogakIdParamSchema) params: MogakIdParams,
    @ZodBody(mogakUpdateRequestSchema) request: MogakUpdateRequest,
  ) {
    return successResponse(
      await this.mogaks.updateMogak(user.userId, params.mogakId, {
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
    await this.mogaks.deleteMogak(user.userId, params.mogakId);
    return successResponse({});
  }
}
