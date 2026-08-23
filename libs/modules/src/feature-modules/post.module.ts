import { Module } from '@nestjs/common';

import { DatabaseModule } from '@infra/database/database.module';
import { AuthModule } from './auth.module';
import { MogakModule } from './mogak.module';
import { StorageModule } from './storage.module';
import { POST_REPOSITORY } from '@core/posts/application/port/post.repository.port';
import { OWNED_MOGAK_PORT } from '@core/mogaks/application/port/ownedMogak.port';
import { OWNED_OCCURRENCE_PORT } from '@core/mogaks/application/port/ownedOccurrence.port';
import { STORAGE_PORT } from '@core/storage/application/storage.port';
import { PostService } from '@core/posts/application/service/post.service';
import { PostRepository } from '@infra/posts/repository/post.repository';

@Module({
  imports: [DatabaseModule, AuthModule, MogakModule, StorageModule],
  providers: [
    PostRepository,
    { provide: POST_REPOSITORY, useExisting: PostRepository },
    {
      provide: PostService,
      inject: [POST_REPOSITORY, OWNED_OCCURRENCE_PORT, STORAGE_PORT, OWNED_MOGAK_PORT],
      useFactory: (repository, occurrences, storage, mogaks) =>
        new PostService(repository, occurrences, storage, mogaks),
    },
  ],
  exports: [PostService],
})
export class PostModule {}
