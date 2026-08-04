import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { BoundedThrottlerStorage } from './common/http/boundedThrottler.storage';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { MogakModule } from './mogaks/mogak.module';
import { PostModule } from './posts/post.module';
import { SocialModule } from './social/social.module';
import { UsersModule } from './users/users.module';

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
