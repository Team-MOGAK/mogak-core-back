import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { parseAppEnv } from './app-env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: parseAppEnv,
    }),
  ],
})
export class AppConfigModule {}
