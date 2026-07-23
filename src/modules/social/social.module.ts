import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { SocialService } from './application/social.service';
import { SocialRepository } from './infrastructure/social.repository';
import { SocialController } from './presentation/social.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [SocialController],
  providers: [SocialRepository, SocialService],
})
export class SocialModule {}
