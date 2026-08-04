import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MogakModule } from '../mogaks/mogak.module';
import { StorageModule } from '../storage/storage.module';
import { POST_REPOSITORY } from './application/port/post.repository.port';
import { PostService } from './application/service/post.service';
import { PostRepository } from './infrastructure/repository/post.repository';
import { PostController } from './presentation/controller/post.controller';

@Module({
  imports: [DatabaseModule, AuthModule, MogakModule, StorageModule],
  controllers: [PostController],
  providers: [
    PostRepository,
    { provide: POST_REPOSITORY, useExisting: PostRepository },
    PostService,
  ],
})
export class PostModule {}
