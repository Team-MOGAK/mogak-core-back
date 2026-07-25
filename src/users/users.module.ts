import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { CONSENT_REPOSITORY } from './application/port/consent.repository.port';
import { METADATA_REPOSITORY } from './application/port/metadata.repository.port';
import { USER_REPOSITORY } from './application/port/user.repository.port';
import { ConsentService } from './application/service/consent.service';
import { MetadataService } from './application/service/metadata.service';
import { UserService } from './application/service/user.service';
import { ConsentRepository } from './infrastructure/repository/consent.repository';
import { MetadataRepository } from './infrastructure/repository/metadata.repository';
import { UserRepository } from './infrastructure/repository/user.repository';
import { ConsentController } from './presentation/controller/consent.controller';
import { MetadataController } from './presentation/controller/metadata.controller';
import { UsersController } from './presentation/controller/users.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [UsersController, ConsentController, MetadataController],
  providers: [
    UserRepository,
    ConsentRepository,
    MetadataRepository,
    { provide: USER_REPOSITORY, useExisting: UserRepository },
    { provide: CONSENT_REPOSITORY, useExisting: ConsentRepository },
    { provide: METADATA_REPOSITORY, useExisting: MetadataRepository },
    UserService,
    ConsentService,
    MetadataService,
  ],
  exports: [UserService, ConsentService, MetadataService],
})
export class UsersModule {}
