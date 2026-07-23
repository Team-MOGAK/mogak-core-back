import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ConsentService } from './application/consent.service';
import { MetadataService } from './application/metadata.service';
import { SESSION_ID_GENERATOR, UserService } from './application/user.service';
import { ConsentRepository } from './infrastructure/consent.repository';
import { MetadataRepository } from './infrastructure/metadata.repository';
import { UserRepository } from './infrastructure/user.repository';
import { ConsentController } from './presentation/consent.controller';
import { MetadataController } from './presentation/metadata.controller';
import { UserController } from './presentation/user.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [UserController, ConsentController, MetadataController],
  providers: [
    UserRepository,
    ConsentRepository,
    MetadataRepository,
    UserService,
    ConsentService,
    MetadataService,
    { provide: SESSION_ID_GENERATOR, useValue: randomUUID },
  ],
  exports: [UserService, ConsentService, MetadataService],
})
export class UsersModule {}
