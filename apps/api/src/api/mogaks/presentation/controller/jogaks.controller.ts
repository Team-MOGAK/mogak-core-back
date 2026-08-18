import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedPrincipal as AuthenticatedUser } from '@core/auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '@api/auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { successResponse } from '@api/common/http/apiResponse';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { ZodBody, ZodParams, ZodQuery } from '@api/common/validation/zodParameter.decorator';
import { JogaksService } from '@core/mogaks/application/service/jogaks.service';
import type { UpdateJogakCommand } from '@core/mogaks/application/type/jogak.command';
import type { JogakExecutionStatus } from '@core/mogaks/domain/vo/jogakExecution.vo';
import {
  createJogakRequestSchema,
  dateQuerySchema,
  dateRangeQuerySchema,
  executionParamSchema,
  jogakIdParamSchema,
  mogakJogakParamSchema,
  updateJogakRequestSchema,
  type CreateJogakRequest,
  type DateQueryRequest,
  type DateRangeQueryRequest,
  type ExecutionParams,
  type JogakIdParams,
  type MogakJogakParams,
  type ScheduleRequest,
  type UpdateJogakRequest,
} from '../type/jogaks.request';

@Controller('api')
export class JogaksController {
  constructor(@Inject(JogaksService) private readonly jogaks: JogaksService) {}

  @Post('jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createJogakRequestSchema) request: CreateJogakRequest,
  ) {
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
  async listOneTime(
    @CurrentUser() user: AuthenticatedUser,
    @ZodQuery(dateQuerySchema) query: DateQueryRequest,
  ) {
    return successResponse(await this.jogaks.listOneTime(user.userId, query.date));
  }

  @Get('jogaks/routines')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listRoutines(
    @CurrentUser() user: AuthenticatedUser,
    @ZodQuery(dateRangeQuerySchema) query: DateRangeQueryRequest,
  ) {
    return successResponse(
      await this.jogaks.listRoutines(user.userId, query.startDay, query.endDay),
    );
  }

  @Get('mogaks/:mogakId/jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listMogakDay(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(mogakJogakParamSchema) params: MogakJogakParams,
    @ZodQuery(dateQuerySchema) query: DateQueryRequest,
  ) {
    return successResponse(await this.jogaks.listMogakDay(user.userId, params.mogakId, query.date));
  }

  @Get('jogaks')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listDay(
    @CurrentUser() user: AuthenticatedUser,
    @ZodQuery(dateQuerySchema) query: DateQueryRequest,
  ) {
    return successResponse(await this.jogaks.listDay(user.userId, query.date));
  }

  @Get('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(jogakIdParamSchema) params: JogakIdParams,
  ) {
    return successResponse(await this.jogaks.getDetail(user.userId, params.jogakId));
  }

  @Patch('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(jogakIdParamSchema) params: JogakIdParams,
    @ZodBody(updateJogakRequestSchema) request: UpdateJogakRequest,
  ) {
    return successResponse(
      await this.jogaks.update(user.userId, params.jogakId, updateCommandFor(request)),
    );
  }

  @Delete('jogaks/:jogakId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(jogakIdParamSchema) params: JogakIdParams,
  ) {
    await this.jogaks.delete(user.userId, params.jogakId);
    return successResponse({});
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/start')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(executionParamSchema) params: ExecutionParams,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, params.jogakId, params.scheduledDate, 'IN_PROGRESS', response);
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/success')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async success(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(executionParamSchema) params: ExecutionParams,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, params.jogakId, params.scheduledDate, 'SUCCESS', response);
  }

  @Post('jogaks/:jogakId/executions/:scheduledDate/fail')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async fail(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(executionParamSchema) params: ExecutionParams,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.command(user, params.jogakId, params.scheduledDate, 'FAIL', response);
  }

  private async command(
    user: AuthenticatedUser,
    jogakId: number,
    scheduledDate: string,
    desiredStatus: JogakExecutionStatus,
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
  throw new DomainException(DomainErrorCode.INVALID_SCHEDULE);
}

function scheduleFor(request: CreateJogakRequest) {
  if (request.schedule !== undefined) {
    if (
      request.isRoutine !== undefined ||
      request.days !== undefined ||
      request.today !== undefined ||
      request.endDate !== undefined
    ) {
      throw new DomainException(DomainErrorCode.INVALID_PARAMETER);
    }
    return explicitScheduleFor(request.schedule);
  }
  if (request.isRoutine === undefined || request.today === undefined) {
    throw new DomainException(DomainErrorCode.INVALID_PARAMETER);
  }
  if (!request.isRoutine) {
    if (request.days !== undefined || request.endDate !== undefined) {
      throw new DomainException(DomainErrorCode.INVALID_SCHEDULE);
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

function updateCommandFor(request: UpdateJogakRequest): UpdateJogakCommand {
  return {
    ...(request.title === undefined ? {} : { title: request.title }),
    ...(request.schedule === undefined
      ? {}
      : {
          schedule: {
            scheduleType: request.schedule.scheduleType as 'ONCE' | 'WEEKLY',
            ...(request.schedule.effectiveTo === undefined
              ? {}
              : { effectiveTo: request.schedule.effectiveTo }),
            weekdays: request.schedule.weekdays,
          },
        }),
  };
}
