import { ValidationPipe, type INestApplication } from '@nestjs/common';

import { AppErrorCode } from './common/http/app-error-code';
import { AppException } from './common/http/app.exception';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';

export function configureApp(
  app: INestApplication,
  options: Readonly<{ corsAllowedOrigins?: readonly string[] }> = {},
): void {
  const corsAllowedOrigins = options.corsAllowedOrigins;
  if (corsAllowedOrigins !== undefined && corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: [...corsAllowedOrigins],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'RefreshToken'],
      credentials: false,
    });
  }

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
