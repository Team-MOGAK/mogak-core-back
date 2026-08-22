import type { INestApplication } from '@nestjs/common';

import { GlobalExceptionFilter } from './common/http/globalException.filter';
import { MERGE_PATCH_MEDIA_TYPE } from './common/http/mergePatch.decorator';
import { rejectRetiredPutRoutes } from './common/http/retiredPut.middleware';

type ExpressApplication = {
  set(setting: 'trust proxy', value: number): void;
};

type BodyParserApplication = {
  useBodyParser(type: 'json', options: { type: string[] }): void;
};

export function configureApp(
  app: INestApplication,
  options: Readonly<{ corsAllowedOrigins?: readonly string[] }> = {},
): void {
  const expressApp = app.getHttpAdapter().getInstance() as ExpressApplication;
  expressApp.set('trust proxy', 1);
  (app as unknown as BodyParserApplication).useBodyParser('json', {
    type: ['application/json', MERGE_PATCH_MEDIA_TYPE],
  });

  const corsAllowedOrigins = options.corsAllowedOrigins;
  if (corsAllowedOrigins !== undefined && corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: [...corsAllowedOrigins],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'RefreshToken'],
      exposedHeaders: ['Accept-Patch'],
      credentials: false,
    });
  }

  app.use(rejectRetiredPutRoutes);

  app.useGlobalFilters(new GlobalExceptionFilter());
}
