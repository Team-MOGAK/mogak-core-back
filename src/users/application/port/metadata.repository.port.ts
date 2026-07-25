import type { Address, Job } from '../../domain/entity/user-metadata.entity';

export const METADATA_REPOSITORY = Symbol('METADATA_REPOSITORY');

export interface MetadataRepositoryPort {
  listJobs(): Promise<Job[]>;
  listAddresses(): Promise<Address[]>;
  findJobByName(name: string): Promise<Job | null>;
  findAddressByName(name: string): Promise<Address | null>;
}
