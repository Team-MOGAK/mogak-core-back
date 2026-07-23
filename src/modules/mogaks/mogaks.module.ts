import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MogaksService } from './application/mogaks.service';
import { MogaksRepository } from './infrastructure/mogaks.repository';
import { MogaksMetadataController } from './presentation/mogaks-metadata.controller';
import { ModaratsMogaksController } from './presentation/modarats-mogaks.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ModaratsMogaksController, MogaksMetadataController],
  providers: [MogaksRepository, MogaksService],
  exports: [MogaksService],
})
export class MogaksModule {}
