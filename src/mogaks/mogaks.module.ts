import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MOGAKS_REPOSITORY } from './application/port/mogaks.repository.port';
import { OWNED_MOGAK_PORT } from './application/port/owned-mogak.port';
import { OWNED_OCCURRENCE_PORT } from './application/port/owned-occurrence.port';
import { MogaksService } from './application/service/mogaks.service';
import { JogaksService, KST_DATE_PROVIDER, kstToday } from './application/service/jogaks.service';
import { MogaksRepository } from './infrastructure/repository/mogaks.repository';
import { JogaksController } from './presentation/controller/jogaks.controller';
import { ModaratsMogaksController } from './presentation/controller/modarats-mogaks.controller';
import { MogaksMetadataController } from './presentation/controller/mogaks-metadata.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ModaratsMogaksController, MogaksMetadataController, JogaksController],
  providers: [
    MogaksRepository,
    { provide: MOGAKS_REPOSITORY, useExisting: MogaksRepository },
    MogaksService,
    JogaksService,
    { provide: OWNED_MOGAK_PORT, useExisting: MogaksService },
    { provide: OWNED_OCCURRENCE_PORT, useExisting: JogaksService },
    { provide: KST_DATE_PROVIDER, useValue: kstToday },
  ],
  exports: [OWNED_MOGAK_PORT, OWNED_OCCURRENCE_PORT],
})
export class MogaksModule {}
