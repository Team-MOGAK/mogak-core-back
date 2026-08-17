import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { MetadataRepositoryPort } from '../../../core/users/application/port/metadata.repository.port';
import type { MetadataResult } from '../../../core/users/application/type/metadata.result';
import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import { addresses, jobs } from '../../database/schema';

@Injectable()
export class MetadataRepository implements MetadataRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listJobs(): Promise<MetadataResult[]> {
    return this.db.select({ id: jobs.id, name: jobs.name }).from(jobs);
  }

  async listAddresses(): Promise<MetadataResult[]> {
    return this.db.select({ id: addresses.id, name: addresses.name }).from(addresses);
  }

  async findJobByName(name: string): Promise<MetadataResult | null> {
    const job = await this.db.query.jobs.findFirst({ where: eq(jobs.name, name) });
    return job ?? null;
  }

  async findAddressByName(name: string): Promise<MetadataResult | null> {
    const address = await this.db.query.addresses.findFirst({ where: eq(addresses.name, name) });
    return address ?? null;
  }
}
