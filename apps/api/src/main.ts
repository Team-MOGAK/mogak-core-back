import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@composition/app.module';
import { configureApp } from '@api/app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  configureApp(app, {
    corsAllowedOrigins: parseCorsAllowedOrigins(config.get<string>('CORS_ALLOWED_ORIGINS')),
  });
  app.enableShutdownHooks();

  await app.listen(Number(config.getOrThrow<string>('PORT')), '0.0.0.0');
}

void bootstrap();

function parseCorsAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim().length === 0) return [];
  return value.split(',').map((origin) => {
    const normalized = origin.trim();
    const url = new URL(normalized);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== normalized) {
      throw new Error('CORS_ALLOWED_ORIGINS에는 완전한 origin만 설정할 수 있습니다.');
    }
    return normalized;
  });
}
