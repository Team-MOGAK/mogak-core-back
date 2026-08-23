import { Module } from '@nestjs/common';

import { DatabaseModule } from '@infra/database/database.module';
import { AuthModule } from './auth.module';
import { StorageModule } from './storage.module';
import { CONSENT_REPOSITORY } from '@core/users/application/port/consent.repository.port';
import { METADATA_REPOSITORY } from '@core/users/application/port/metadata.repository.port';
import { USER_REPOSITORY } from '@core/users/application/port/user.repository.port';
import { SESSION_TOKEN_ISSUER } from '@core/auth/application/port/sessionTokenIssuer.port';
import { STORAGE_PORT } from '@core/storage/application/storage.port';
import { ConsentService } from '@core/users/application/service/consent.service';
import { MetadataService } from '@core/users/application/service/metadata.service';
import { UserService } from '@core/users/application/service/user.service';
import { ConsentRepository } from '@infra/users/repository/consent.repository';
import { MetadataRepository } from '@infra/users/repository/metadata.repository';
import { UserRepository } from '@infra/users/repository/user.repository';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  providers: [
    UserRepository,
    ConsentRepository,
    MetadataRepository,
    { provide: USER_REPOSITORY, useExisting: UserRepository },
    { provide: CONSENT_REPOSITORY, useExisting: ConsentRepository },
    { provide: METADATA_REPOSITORY, useExisting: MetadataRepository },
    {
      provide: ConsentService,
      inject: [CONSENT_REPOSITORY],
      useFactory: (repository) => new ConsentService(repository),
    },
    {
      provide: MetadataService,
      inject: [METADATA_REPOSITORY],
      useFactory: (repository) => new MetadataService(repository),
    },
    {
      provide: UserService,
      inject: [
        USER_REPOSITORY,
        METADATA_REPOSITORY,
        ConsentService,
        SESSION_TOKEN_ISSUER,
        STORAGE_PORT,
      ],
      useFactory: (users, metadata, consents, tokenIssuer, storage) =>
        new UserService(users, metadata, consents, tokenIssuer, storage),
    },
  ],
  exports: [UserService, ConsentService, MetadataService],
})
export class UsersModule {}
