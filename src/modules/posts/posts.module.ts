import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MogaksModule } from '../mogaks/mogaks.module';
import { StorageModule } from '../storage/storage.module';
import { PostsService } from './application/posts.service';
import { PostsRepository } from './infrastructure/posts.repository';
import { PostsController } from './presentation/posts.controller';

@Module({
  imports: [DatabaseModule, AuthModule, MogaksModule, StorageModule],
  controllers: [PostsController],
  providers: [PostsRepository, PostsService],
})
export class PostsModule {}
