import { Type } from 'class-transformer';
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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';

import { successResponse } from '../../../common/http/api-response';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { JogaksService } from '../application/jogaks.service';
import type { StoredExecutionStatus } from '../domain/occurrence';

class DateQuery {
  @IsDateString()
  date!: string;
}

class DateRangeQuery {
  @IsDateString()
  startDay!: string;

  @IsDateString()
  endDay!: string;
}

class ScheduleRequest {
  @IsString()
  @IsNotEmpty()
  scheduleType!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weekdays?: string[];
}

class CreateJogakRequest {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  mogakId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleRequest)
  schedule?: ScheduleRequest;

  @IsOptional()
  @IsBoolean()
  isRoutine?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  days?: string[];

  @IsOptional()
  @IsDateString()
  today?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

class UpdateJogakRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleRequest)
  schedule?: ScheduleRequest;
}

@Controller('api')
export class JogaksController {
  constructor(@Inject(JogaksService) private readonly jogaks: JogaksService) {}

  @Post('jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() request: CreateJogakRequest) {
    return successResponse(
      await this.jogaks.create(user.userId, {
        mogakId: request.mogakId,
        title: request.title,
        schedule: scheduleFor(request),
      }),
      HttpStatus.CREATED,
    );
  }

  @Get('jogaks/daily')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listOneTime(@CurrentUser() user: AuthenticatedUser, @Query() query: DateQuery) {
    return successResponse(await this.jogaks.listOneTime(user.userId, query.date));
  }

  @Get('jogaks/routines')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listRoutines(@CurrentUser() user: AuthenticatedUser, @Query() query: DateRangeQuery) {
    return successResponse(
      await this.jogaks.listRoutines(user.userId, query.startDay, query.endDay),
    );
  }

  @Get('mogaks/:mogakId/jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listMogakDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mogakId') mogakId: string,
    @Query() query: DateQuery,
  ) {
    return successResponse(
      await this.jogaks.listMogakDay(user.userId, asSafeId(mogakId), query.date),
    );
  }

  @Get('jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listDay(@CurrentUser() user: AuthenticatedUser, @Query() query: DateQuery) {
    return successResponse(await this.jogaks.listDay(user.userId, query.date));
  }

  @Get('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getDetail(@CurrentUser() user: AuthenticatedUser, @Param('jogakId') jogakId: string) {
    return successResponse(await this.jogaks.getDetail(user.userId, asSafeId(jogakId)));
  }

  @Put('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jogakId') jogakId: string,
    @Body() request: UpdateJogakRequest,
  ) {
    return successResponse(
      await this.jogaks.update(user.userId, asSafeId(jogakId), {
        title: request.title,
        ...(request.schedule === undefined
          ? {}
          : { schedule: explicitScheduleFor(request.schedule) }),
      }),
    );
  }

  @Delete('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('jogakId') jogakId: string) {
    await this.jogaks.delete(user.userId, asSafeId(jogakId));
    return successResponse({});
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/start')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jogakId') jogakId: string,
    @Param('scheduledDate') scheduledDate: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, asSafeId(jogakId), scheduledDate, 'IN_PROGRESS', response);
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/success')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async success(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jogakId') jogakId: string,
    @Param('scheduledDate') scheduledDate: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, asSafeId(jogakId), scheduledDate, 'SUCCESS', response);
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/fail')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async fail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jogakId') jogakId: string,
    @Param('scheduledDate') scheduledDate: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, asSafeId(jogakId), scheduledDate, 'FAIL', response);
  }

  private async command(
    user: AuthenticatedUser,
    jogakId: number,
    scheduledDate: string,
    desiredStatus: StoredExecutionStatus,
    response: Response,
  ) {
    const result = await this.jogaks.commandExecution(
      user.userId,
      jogakId,
      scheduledDate,
      desiredStatus,
    );
    const status = result.created ? HttpStatus.CREATED : HttpStatus.OK;
    response.status(status);
    return successResponse(result.execution, status);
  }
}

function asSafeId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  return id;
}

function asScheduleType(value: string): 'ONCE' | 'WEEKLY' {
  if (value === 'ONCE' || value === 'WEEKLY') return value;
  throw new AppException(AppErrorCode.INVALID_SCHEDULE);
}

function scheduleFor(request: CreateJogakRequest) {
  if (request.schedule !== undefined) {
    if (
      request.isRoutine !== undefined ||
      request.days !== undefined ||
      request.today !== undefined ||
      request.endDate !== undefined
    ) {
      throw new AppException(AppErrorCode.INVALID_PARAMETER);
    }
    return explicitScheduleFor(request.schedule);
  }
  if (request.isRoutine === undefined || request.today === undefined) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  if (!request.isRoutine) {
    if (request.days !== undefined || request.endDate !== undefined) {
      throw new AppException(AppErrorCode.INVALID_SCHEDULE);
    }
    return { scheduleType: 'ONCE' as const, effectiveFrom: request.today };
  }
  return {
    scheduleType: 'WEEKLY' as const,
    effectiveFrom: request.today,
    ...(request.endDate === undefined ? {} : { effectiveTo: request.endDate }),
    ...(request.days === undefined ? {} : { weekdays: request.days }),
  };
}

function explicitScheduleFor(request: ScheduleRequest) {
  return {
    scheduleType: asScheduleType(request.scheduleType),
    effectiveFrom: request.effectiveFrom,
    ...(request.effectiveTo === undefined ? {} : { effectiveTo: request.effectiveTo }),
    ...(request.weekdays === undefined ? {} : { weekdays: request.weekdays }),
  };
}
