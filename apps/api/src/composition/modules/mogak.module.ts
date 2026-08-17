import { Module } from '@nestjs/common';

import { DatabaseModule } from '@infra/database/database.module';
import { AuthModule } from './auth.module';
import { MOGAK_REPOSITORY } from '@core/mogaks/application/port/mogak.repository.port';
import { OWNED_MOGAK_PORT } from '@core/mogaks/application/port/ownedMogak.port';
import { OWNED_OCCURRENCE_PORT } from '@core/mogaks/application/port/ownedOccurrence.port';
import { MogakService } from '@core/mogaks/application/service/mogak.service';
import {
  JogaksService,
  KST_DATE_PROVIDER,
  kstToday,
} from '@core/mogaks/application/service/jogaks.service';
import { MogakRepository } from '@infra/mogaks/repository/mogak.repository';
import { JogaksController } from '@api/mogaks/presentation/controller/jogaks.controller';
import { ModaratMogakController } from '@api/mogaks/presentation/controller/modaratMogak.controller';
import { MogakMetadataController } from '@api/mogaks/presentation/controller/mogakMetadata.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ModaratMogakController, MogakMetadataController, JogaksController],
  providers: [
    MogakRepository,
    { provide: MOGAK_REPOSITORY, useExisting: MogakRepository },
    {
      provide: MogakService,
      inject: [MOGAK_REPOSITORY],
      useFactory: (repository) => new MogakService(repository),
    },
    {
      provide: JogaksService,
      inject: [MOGAK_REPOSITORY, KST_DATE_PROVIDER],
      useFactory: (repository, today) => new JogaksService(repository, today),
    },
    { provide: OWNED_MOGAK_PORT, useExisting: MogakService },
    { provide: OWNED_OCCURRENCE_PORT, useExisting: JogaksService },
    { provide: KST_DATE_PROVIDER, useValue: kstToday },
  ],
  exports: [OWNED_MOGAK_PORT, OWNED_OCCURRENCE_PORT],
})
export class MogakModule {}
