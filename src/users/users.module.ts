import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { CONSENT_REPOSITORY } from './application/port/consent.repository.port';
import { METADATA_REPOSITORY } from './application/port/metadata.repository.port';
import { USER_REPOSITORY } from './application/port/user.repository.port';
import { ConsentService } from './application/service/consent.service';
import { MetadataService } from './application/service/metadata.service';
import { SESSION_ID_GENERATOR, UserService } from './application/service/user.service';
import { DrizzleConsentRepository } from './infrastructure/repository/consent.repository';
import { DrizzleMetadataRepository } from './infrastructure/repository/metadata.repository';
import { DrizzleUserRepository } from './infrastructure/repository/user.repository';
import { ConsentController } from './presentation/controller/consent.controller';
import { MetadataController } from './presentation/controller/metadata.controller';
import { UsersController } from './presentation/controller/users.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [UsersController, ConsentController, MetadataController],
  providers: [
    DrizzleUserRepository,
    DrizzleConsentRepository,
    DrizzleMetadataRepository,
    { provide: USER_REPOSITORY, useExisting: DrizzleUserRepository },
    { provide: CONSENT_REPOSITORY, useExisting: DrizzleConsentRepository },
    { provide: METADATA_REPOSITORY, useExisting: DrizzleMetadataRepository },
    UserService,
    ConsentService,
    MetadataService,
    { provide: SESSION_ID_GENERATOR, useValue: randomUUID },
  ],
  exports: [UserService, ConsentService, MetadataService],
})
export class UsersModule {}
