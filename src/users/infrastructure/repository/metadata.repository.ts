import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { MetadataRepositoryPort } from '../../application/port/metadata.repository.port';
import type { Address, Job } from '../../domain/entity/user-metadata.entity';
import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { addresses, jobs } from '../../../database/schema';

@Injectable()
export class DrizzleMetadataRepository implements MetadataRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listJobs(): Promise<Job[]> {
    return this.db.select({ id: jobs.id, name: jobs.name }).from(jobs);
  }

  async listAddresses(): Promise<Address[]> {
    return this.db.select({ id: addresses.id, name: addresses.name }).from(addresses);
  }

  async findJobByName(name: string): Promise<Job | null> {
    const job = await this.db.query.jobs.findFirst({ where: eq(jobs.name, name) });
    return job ?? null;
  }

  async findAddressByName(name: string): Promise<Address | null> {
    const address = await this.db.query.addresses.findFirst({ where: eq(addresses.name, name) });
    return address ?? null;
  }
}
