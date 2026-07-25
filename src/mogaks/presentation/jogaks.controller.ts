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
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { z } from 'zod';

import { successResponse } from '../../common/http/api-response';
import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '../../common/validation/request-schema';
import type { AuthenticatedPrincipal as AuthenticatedUser } from '../../auth/application/type/authenticated-principal';
import { AccessTokenGuard } from '../../auth/presentation/controller/access-token.guard';
import { CurrentUser } from '../../auth/presentation/controller/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/controller/registered-user.guard';
import { JogaksService } from '../application/jogaks.service';
import type { StoredExecutionStatus } from '../domain/occurrence';

const scheduleSchema = z
  .object({
    scheduleType: z.string().min(1),
    effectiveFrom: calendarDateSchema,
    effectiveTo: calendarDateSchema.optional(),
    weekdays: z.array(z.string()).optional(),
  })
  .strict();

type ScheduleRequest = z.infer<typeof scheduleSchema>;

class DateQuery extends createZodDto(z.object({ date: calendarDateSchema }).strict()) {}

class DateRangeQuery extends createZodDto(
  z.object({ startDay: calendarDateSchema, endDay: calendarDateSchema }).strict(),
) {}

class CreateJogakRequest extends createZodDto(
  z
    .object({
      mogakId: positiveIdSchema,
      title: requiredTextSchema(1, 100),
      schedule: scheduleSchema.optional(),
      isRoutine: z.boolean().optional(),
      days: z.array(z.string()).optional(),
      today: calendarDateSchema.optional(),
      endDate: calendarDateSchema.optional(),
    })
    .strict(),
) {}

class UpdateJogakRequest extends createZodDto(
  z
    .object({
      title: requiredTextSchema(1, 100),
      schedule: scheduleSchema.optional(),
    })
    .strict(),
) {}

class MogakJogakParam extends createZodDto(z.object({ mogakId: positiveIdSchema }).strict()) {}

class JogakIdParam extends createZodDto(z.object({ jogakId: positiveIdSchema }).strict()) {}

class ExecutionParam extends createZodDto(
  z.object({ jogakId: positiveIdSchema, scheduledDate: z.string().min(1) }).strict(),
) {}

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
    @Param() params: MogakJogakParam,
    @Query() query: DateQuery,
  ) {
    return successResponse(await this.jogaks.listMogakDay(user.userId, params.mogakId, query.date));
  }

  @Get('jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listDay(@CurrentUser() user: AuthenticatedUser, @Query() query: DateQuery) {
    return successResponse(await this.jogaks.listDay(user.userId, query.date));
  }

  @Get('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getDetail(@CurrentUser() user: AuthenticatedUser, @Param() params: JogakIdParam) {
    return successResponse(await this.jogaks.getDetail(user.userId, params.jogakId));
  }

  @Put('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: JogakIdParam,
    @Body() request: UpdateJogakRequest,
  ) {
    return successResponse(
      await this.jogaks.update(user.userId, params.jogakId, {
        title: request.title,
        ...(request.schedule === undefined
          ? {}
          : { schedule: explicitScheduleFor(request.schedule) }),
      }),
    );
  }

  @Delete('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param() params: JogakIdParam) {
    await this.jogaks.delete(user.userId, params.jogakId);
    return successResponse({});
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/start')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ExecutionParam,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, params.jogakId, params.scheduledDate, 'IN_PROGRESS', response);
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/success')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async success(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ExecutionParam,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, params.jogakId, params.scheduledDate, 'SUCCESS', response);
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/fail')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async fail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ExecutionParam,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, params.jogakId, params.scheduledDate, 'FAIL', response);
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

function asScheduleType(value: string): 'ONCE' | 'WEEKLY' {
  if (value === 'ONCE' || value === 'WEEKLY') return value;
  throw new DomainException(AppErrorCode.INVALID_SCHEDULE);
}

function scheduleFor(request: CreateJogakRequest) {
  if (request.schedule !== undefined) {
    if (
      request.isRoutine !== undefined ||
      request.days !== undefined ||
      request.today !== undefined ||
      request.endDate !== undefined
    ) {
      throw new DomainException(AppErrorCode.INVALID_PARAMETER);
    }
    return explicitScheduleFor(request.schedule);
  }
  if (request.isRoutine === undefined || request.today === undefined) {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
  if (!request.isRoutine) {
    if (request.days !== undefined || request.endDate !== undefined) {
      throw new DomainException(AppErrorCode.INVALID_SCHEDULE);
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
