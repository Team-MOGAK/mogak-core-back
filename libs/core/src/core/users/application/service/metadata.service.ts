import type { MetadataRepositoryPort } from '../port/metadata.repository.port';
import type { MetadataResult } from '../type/metadata.result';

export class MetadataService {
  constructor(private readonly repository: MetadataRepositoryPort) {}

  async jobs(): Promise<MetadataResult[]> {
    return this.repository.listJobs();
  }

  async addresses(): Promise<MetadataResult[]> {
    return this.repository.listAddresses();
  }
}
