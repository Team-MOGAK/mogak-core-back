import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuthModule } from './auth.module';
import { StorageModule } from './storage.module';
import { SOCIAL_REPOSITORY } from '../../core/social/application/port/social.repository.port';
import { STORAGE_PORT } from '../../core/storage/application/storage.port';
import { SocialService } from '../../core/social/application/service/social.service';
import { SocialRepository } from '../../infrastructure/social/repository/social.repository';
import { SocialController } from '../../api/social/presentation/controller/social.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [SocialController],
  providers: [
    {
      provide: SocialService,
      inject: [SOCIAL_REPOSITORY, STORAGE_PORT],
      useFactory: (repository, storage) => new SocialService(repository, storage),
    },
    SocialRepository,
    { provide: SOCIAL_REPOSITORY, useExisting: SocialRepository },
  ],
})
export class SocialModule {}
