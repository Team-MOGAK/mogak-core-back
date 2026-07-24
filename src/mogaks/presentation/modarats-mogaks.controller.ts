import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { successResponse } from '../../common/http/api-response';
import { positiveIdSchema, requiredTextSchema } from '../../common/validation/request-schema';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { MogaksService } from '../application/mogaks.service';

class ModaratRequest extends createZodDto(
  z
    .object({
      title: requiredTextSchema(1, 100),
      color: requiredTextSchema(1, 100),
    })
    .strict(),
) {}

class MogakRequest extends createZodDto(
  z
    .object({
      modaratId: positiveIdSchema,
      title: requiredTextSchema(1, 100),
      categoryCode: z.string().min(1).max(100).optional(),
      customCategoryName: z.string().min(1).max(200).optional(),
      color: z.string().min(4).max(10).optional(),
    })
    .strict(),
) {}

class MogakUpdateRequest extends createZodDto(
  z
    .object({
      title: requiredTextSchema(1, 100),
      categoryCode: z.string().min(1).max(100).optional(),
      customCategoryName: z.string().min(1).max(200).optional(),
      color: z.string().min(4).max(10).optional(),
    })
    .strict(),
) {}

class ModaratIdParam extends createZodDto(z.object({ modaratId: positiveIdSchema }).strict()) {}

class MogakIdParam extends createZodDto(z.object({ mogakId: positiveIdSchema }).strict()) {}

@Controller('api')
export class ModaratsMogaksController {
  constructor(@Inject(MogaksService) private readonly mogaks: MogaksService) {}

  @Post('modarats')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async createModarat(@CurrentUser() user: AuthenticatedUser, @Body() request: ModaratRequest) {
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
  async getModarat(@CurrentUser() user: AuthenticatedUser, @Param() params: ModaratIdParam) {
    return successResponse(await this.mogaks.getModarat(user.userId, params.modaratId));
  }

  @Put('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateModarat(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ModaratIdParam,
    @Body() request: ModaratRequest,
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
  async deleteModarat(@CurrentUser() user: AuthenticatedUser, @Param() params: ModaratIdParam) {
    await this.mogaks.deleteModarat(user.userId, params.modaratId);
  }

  @Post('mogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async createMogak(@CurrentUser() user: AuthenticatedUser, @Body() request: MogakRequest) {
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
  async listMogaks(@CurrentUser() user: AuthenticatedUser, @Param() params: ModaratIdParam) {
    return successResponse(await this.mogaks.listMogaks(user.userId, params.modaratId));
  }

  @Put('mogaks/:mogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMogak(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MogakIdParam,
    @Body() request: MogakUpdateRequest,
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
  async deleteMogak(@CurrentUser() user: AuthenticatedUser, @Param() params: MogakIdParam) {
    await this.mogaks.deleteMogak(user.userId, params.mogakId);
    return successResponse({});
  }
}
