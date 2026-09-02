import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { GlobalExceptionFilter } from '@api/common/http/globalException.filter';

export const pinoGlobalExceptionFilterTestImports = [
  LoggerModule.forRoot({
    pinoHttp: {
      autoLogging: false,
      level: 'silent',
    },
  }),
];

export const pinoGlobalExceptionFilterTestProviders = [
  { provide: APP_FILTER, useClass: GlobalExceptionFilter },
];
