import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { AppEnv } from './config/appEnv';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppEnv, true>);
  configureApp(app, {
    corsAllowedOrigins: config.getOrThrow('CORS_ALLOWED_ORIGINS', { infer: true }),
  });
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow('PORT', { infer: true }));
}

void bootstrap();
