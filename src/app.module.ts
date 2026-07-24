import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { MogaksModule } from './mogaks/mogaks.module';
import { PostsModule } from './posts/posts.module';
import { SocialModule } from './social/social.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    StorageModule,
    UsersModule,
    MogaksModule,
    PostsModule,
    SocialModule,
  ],
})
export class AppModule {}
