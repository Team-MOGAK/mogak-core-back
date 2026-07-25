import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MogaksModule } from '../mogaks/mogaks.module';
import { StorageModule } from '../storage/storage.module';
import { POSTS_REPOSITORY } from './application/port/posts.repository.port';
import { PostsService } from './application/service/posts.service';
import { PostsRepository } from './infrastructure/repository/posts.repository';
import { PostsController } from './presentation/controller/posts.controller';

@Module({
  imports: [DatabaseModule, AuthModule, MogaksModule, StorageModule],
  controllers: [PostsController],
  providers: [PostsRepository, { provide: POSTS_REPOSITORY, useExisting: PostsRepository }, PostsService],
})
export class PostsModule {}
