import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from '@api/auth/presentation/controller/auth.controller';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { BoundedThrottlerStorage } from '@api/common/http/boundedThrottler.storage';
import { HealthModule } from '@api/health/health.module';
import { JogaksController } from '@api/mogaks/presentation/controller/jogaks.controller';
import { ModaratMogakController } from '@api/mogaks/presentation/controller/modaratMogak.controller';
import { MogakMetadataController } from '@api/mogaks/presentation/controller/mogakMetadata.controller';
import { PostController } from '@api/posts/presentation/controller/post.controller';
import { SocialController } from '@api/social/presentation/controller/social.controller';
import { ConsentController } from '@api/users/presentation/controller/consent.controller';
import { MetadataController } from '@api/users/presentation/controller/metadata.controller';
import { UsersController } from '@api/users/presentation/controller/users.controller';
import { AppConfigModule } from '@infra/config/config.module';
import { AuthModule } from '@mogak/modules/feature-modules/auth.module';
import { MogakModule } from '@mogak/modules/feature-modules/mogak.module';
import { PostModule } from '@mogak/modules/feature-modules/post.module';
import { SocialModule } from '@mogak/modules/feature-modules/social.module';
import { StorageModule } from '@mogak/modules/feature-modules/storage.module';
import { UsersModule } from '@mogak/modules/feature-modules/users.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot({
      storage: new BoundedThrottlerStorage(),
      throttlers: [{ ttl: 60_000, limit: 300 }],
    }),
    HealthModule,
    AuthModule,
    StorageModule,
    UsersModule,
    MogakModule,
    PostModule,
    SocialModule,
  ],
  controllers: [
    AuthController,
    UsersController,
    ConsentController,
    MetadataController,
    ModaratMogakController,
    MogakMetadataController,
    JogaksController,
    PostController,
    SocialController,
  ],
  providers: [
    AccessTokenGuard,
    RegisteredUserGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
