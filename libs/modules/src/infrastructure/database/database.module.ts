import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';

import { databaseProviders } from './database.provider';
import { DATABASE, PG_POOL } from './database.tokens';
import { AlertingModule } from '@infra/alerting/alerting.module';

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  imports: [AlertingModule],
  providers: [...databaseProviders, DatabaseLifecycle],
  exports: [DATABASE, PG_POOL],
})
export class DatabaseModule {}
