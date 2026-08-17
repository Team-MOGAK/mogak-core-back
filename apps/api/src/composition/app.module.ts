import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { BoundedThrottlerStorage } from '../api/common/http/boundedThrottler.storage';
import { AppConfigModule } from '../infrastructure/config/config.module';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { HealthModule } from '../api/health/health.module';
import { AuthModule } from './modules/auth.module';
import { StorageModule } from './modules/storage.module';
import { MogakModule } from './modules/mogak.module';
import { PostModule } from './modules/post.module';
import { SocialModule } from './modules/social.module';
import { UsersModule } from './modules/users.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot({
      storage: new BoundedThrottlerStorage(),
      throttlers: [{ ttl: 60_000, limit: 300 }],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    StorageModule,
    UsersModule,
    MogakModule,
    PostModule,
    SocialModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
