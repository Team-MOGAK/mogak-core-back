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
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { successResponse } from '../../../common/http/api-response';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { MogaksService } from '../application/mogaks.service';

class ModaratRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 100)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 100)
  color!: string;
}

class MogakRequest {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  modaratId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  categoryCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  customCategoryName?: string;

  @IsOptional()
  @IsString()
  @Length(4, 10)
  color?: string;
}

class MogakUpdateRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  categoryCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  customCategoryName?: string;

  @IsOptional()
  @IsString()
  @Length(4, 10)
  color?: string;
}

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
  async getModarat(@CurrentUser() user: AuthenticatedUser, @Param('modaratId') modaratId: string) {
    return successResponse(await this.mogaks.getModarat(user.userId, asSafeId(modaratId)));
  }

  @Put('modarats/:modaratId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateModarat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('modaratId') modaratId: string,
    @Body() request: ModaratRequest,
  ) {
    return successResponse(
      await this.mogaks.updateModarat(user.userId, asSafeId(modaratId), {
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
    @Param('modaratId') modaratId: string,
  ) {
    await this.mogaks.deleteModarat(user.userId, asSafeId(modaratId));
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
  async listMogaks(@CurrentUser() user: AuthenticatedUser, @Param('modaratId') modaratId: string) {
    return successResponse(await this.mogaks.listMogaks(user.userId, asSafeId(modaratId)));
  }

  @Put('mogaks/:mogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateMogak(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mogakId') mogakId: string,
    @Body() request: MogakUpdateRequest,
  ) {
    return successResponse(
      await this.mogaks.updateMogak(user.userId, asSafeId(mogakId), {
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
  async deleteMogak(@CurrentUser() user: AuthenticatedUser, @Param('mogakId') mogakId: string) {
    await this.mogaks.deleteMogak(user.userId, asSafeId(mogakId));
    return successResponse({});
  }
}

function asSafeId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  return id;
}
