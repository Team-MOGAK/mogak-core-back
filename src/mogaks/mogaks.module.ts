import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MogaksService } from './application/mogaks.service';
import { JogaksService, KST_DATE_PROVIDER, kstToday } from './application/jogaks.service';
import { MogaksRepository } from './infrastructure/mogaks.repository';
import { MogaksMetadataController } from './presentation/mogaks-metadata.controller';
import { JogaksController } from './presentation/jogaks.controller';
import { ModaratsMogaksController } from './presentation/modarats-mogaks.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ModaratsMogaksController, MogaksMetadataController, JogaksController],
  providers: [
    MogaksRepository,
    MogaksService,
    JogaksService,
    { provide: KST_DATE_PROVIDER, useValue: kstToday },
  ],
  exports: [MogaksService, JogaksService],
})
export class MogaksModule {}
