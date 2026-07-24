import { Inject, Injectable } from '@nestjs/common';

import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import { addresses, jobs } from '../../database/schema';
import type { MetadataItem } from './user.repository';

@Injectable()
export class MetadataRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listJobs(): Promise<MetadataItem[]> {
    return this.db.select({ id: jobs.id, name: jobs.name }).from(jobs);
  }

  async listAddresses(): Promise<MetadataItem[]> {
    return this.db.select({ id: addresses.id, name: addresses.name }).from(addresses);
  }
}
