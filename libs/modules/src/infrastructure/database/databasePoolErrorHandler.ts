import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { LogEvent } from '@mogak/shared';
import { ALERT_NOTIFIER, type AlertNotifier } from '@infra/alerting/alertNotifier';

@Injectable()
export class DatabasePoolErrorHandler {
  private readonly logger: Logger;

  constructor(
    @Inject(PinoLogger) pinoLogger: PinoLogger,
    @Inject(ALERT_NOTIFIER) private readonly alertNotifier: AlertNotifier,
  ) {
    this.logger = pinoLogger.logger.child({});
  }

  handle(error: Error): void {
    const details = error as Error & {
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
    };
    const errorId = randomUUID();
    this.logger.error(
      {
        event: LogEvent.DATABASE_POOL_ERROR,
        errorId,
        alertEligible: true,
        err: {
          database: {
            code: safeDatabaseCode(details.code),
            constraint: safeDatabaseIdentifier(details.constraint),
            table: safeDatabaseIdentifier(details.table),
          },
        },
      },
      'Database pool error',
    );
    this.alertNotifier.notify({ event: LogEvent.DATABASE_POOL_ERROR, errorId, statusCode: 500 });
  }
}

function safeDatabaseCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : undefined;
}

function safeDatabaseIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(value) ? value : undefined;
}
