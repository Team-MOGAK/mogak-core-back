import { ValidationPipe, type INestApplication } from '@nestjs/common';

import { AppErrorCode } from './common/http/app-error-code';
import { AppException } from './common/http/app.exception';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: () => new AppException(AppErrorCode.INVALID_PARAMETER),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
