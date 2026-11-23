import { Controller, Get, HttpStatus, Inject, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { LogEvent } from '@mogak/shared';

import { ALERT_NOTIFIER, type AlertNotifier } from '@infra/alerting/alertNotifier';
import { PG_POOL } from '@infra/database/database.tokens';
import {
  markResponseErrorLog,
  requestErrorId,
  type RequestLogContext,
} from '@infra/logging/errorAlert.context';

const READINESS_ROUTE = '/health/ready';

@Controller('health')
@SkipThrottle()
export class HealthController {
  /** 인스턴스별 직전 readiness 결과. 상태가 바뀔 때만 알림을 보낸다. */
  private ready = true;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ALERT_NOTIFIER) private readonly alertNotifier: AlertNotifier,
  ) {}

  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' | 'unavailable' }> {
    const errorId = requestErrorId(request as unknown as RequestLogContext);
    try {
      await this.pool.query('SELECT 1');
      if (!this.ready) {
        this.ready = true;
        this.alertNotifier.notify({
          event: LogEvent.READINESS_RECOVERED,
          errorId,
          method: 'GET',
          route: READINESS_ROUTE,
        });
      }
      return { status: 'ok' };
    } catch {
      // 프로브가 수 초마다 호출하므로 요청 단위 알림은 막고(marker), 전이 시점에만 알린다.
      markResponseErrorLog(response, { errorId });
      if (this.ready) {
        this.ready = false;
        this.alertNotifier.notify({
          event: LogEvent.READINESS_FAILED,
          errorId,
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          method: 'GET',
          route: READINESS_ROUTE,
        });
      }
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'unavailable' };
    }
  }
}
