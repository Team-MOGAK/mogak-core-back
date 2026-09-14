import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Pool } from 'pg';

import { PG_POOL } from '@infra/database/database.tokens';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' | 'unavailable' }> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'unavailable' };
    }
  }
}
