import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { parseAppEnv } from './appEnv';

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
