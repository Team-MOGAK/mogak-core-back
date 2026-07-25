import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { SOCIAL_REPOSITORY } from './application/port/social.repository.port';
import { SocialService } from './application/service/social.service';
import { SocialRepository } from './infrastructure/repository/social.repository';
import { SocialController } from './presentation/controller/social.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [SocialController],
  providers: [
    SocialService,
    SocialRepository,
    { provide: SOCIAL_REPOSITORY, useExisting: SocialRepository },
  ],
})
export class SocialModule {}
