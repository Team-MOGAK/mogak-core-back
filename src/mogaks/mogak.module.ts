import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MOGAK_REPOSITORY } from './application/port/mogak.repository.port';
import { OWNED_MOGAK_PORT } from './application/port/ownedMogak.port';
import { OWNED_OCCURRENCE_PORT } from './application/port/ownedOccurrence.port';
import { MogakService } from './application/service/mogak.service';
import { JogaksService, KST_DATE_PROVIDER, kstToday } from './application/service/jogaks.service';
import { MogakRepository } from './infrastructure/repository/mogak.repository';
import { JogaksController } from './presentation/controller/jogaks.controller';
import { ModaratMogakController } from './presentation/controller/modaratMogak.controller';
import { MogakMetadataController } from './presentation/controller/mogakMetadata.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ModaratMogakController, MogakMetadataController, JogaksController],
  providers: [
    MogakRepository,
    { provide: MOGAK_REPOSITORY, useExisting: MogakRepository },
    MogakService,
    JogaksService,
    { provide: OWNED_MOGAK_PORT, useExisting: MogakService },
    { provide: OWNED_OCCURRENCE_PORT, useExisting: JogaksService },
    { provide: KST_DATE_PROVIDER, useValue: kstToday },
  ],
  exports: [OWNED_MOGAK_PORT, OWNED_OCCURRENCE_PORT],
})
export class MogakModule {}
