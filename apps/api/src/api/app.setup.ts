import type { INestApplication } from '@nestjs/common';

import { GlobalExceptionFilter } from './common/http/globalException.filter';

type ExpressApplication = {
  set(setting: 'trust proxy', value: number): void;
};

export function configureApp(
  app: INestApplication,
  options: Readonly<{ corsAllowedOrigins?: readonly string[] }> = {},
): void {
  const expressApp = app.getHttpAdapter().getInstance() as ExpressApplication;
  expressApp.set('trust proxy', 1);

  const corsAllowedOrigins = options.corsAllowedOrigins;
  if (corsAllowedOrigins !== undefined && corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: [...corsAllowedOrigins],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'RefreshToken'],
      credentials: false,
    });
  }

  app.useGlobalFilters(new GlobalExceptionFilter());
}
