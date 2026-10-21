import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { GlobalExceptionFilter } from '@api/common/http/globalException.filter';
import { ALERT_NOTIFIER } from '@infra/alerting/alertNotifier';

export const pinoGlobalExceptionFilterTestImports = [
  LoggerModule.forRoot({
    pinoHttp: {
      autoLogging: false,
      level: 'silent',
    },
  }),
];

export const pinoGlobalExceptionFilterTestProviders = [
  { provide: ALERT_NOTIFIER, useValue: { notify: () => undefined } },
  { provide: APP_FILTER, useClass: GlobalExceptionFilter },
];
