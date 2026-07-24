import type { INestApplication } from '@nestjs/common';

import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { AppZodValidationPipe } from './common/validation/zod-validation.pipe';

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

  app.useGlobalPipes(new AppZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
