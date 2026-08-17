import type { MetadataResult } from '../type/metadata.result';

export const METADATA_REPOSITORY = Symbol('METADATA_REPOSITORY');

export interface MetadataRepositoryPort {
  listJobs(): Promise<MetadataResult[]>;
  listAddresses(): Promise<MetadataResult[]>;
  findJobByName(name: string): Promise<MetadataResult | null>;
  findAddressByName(name: string): Promise<MetadataResult | null>;
}
