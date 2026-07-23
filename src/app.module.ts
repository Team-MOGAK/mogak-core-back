import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { StorageModule } from './modules/storage/storage.module';
import { MogaksModule } from './modules/mogaks/mogaks.module';
import { PostsModule } from './modules/posts/posts.module';
import { SocialModule } from './modules/social/social.module';
import { UsersModule } from './modules/users/users.module';

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
