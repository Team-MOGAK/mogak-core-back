import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuthSessionsRepository } from './infrastructure/auth-sessions.repository';
import { TokenService } from './infrastructure/token.service';

@Module({
  imports: [DatabaseModule],
  providers: [TokenService, AuthSessionsRepository],
  exports: [TokenService, AuthSessionsRepository],
})
export class AuthModule {}
