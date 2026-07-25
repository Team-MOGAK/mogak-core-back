import { Inject, Injectable } from '@nestjs/common';

import { METADATA_REPOSITORY, type MetadataRepositoryPort } from '../port/metadata.repository.port';
import type { MetadataResult } from '../type/metadata.result';

@Injectable()
export class MetadataService {
  constructor(@Inject(METADATA_REPOSITORY) private readonly repository: MetadataRepositoryPort) {}

  async jobs(): Promise<MetadataResult[]> {
    return this.repository.listJobs();
  }

  async addresses(): Promise<MetadataResult[]> {
    return this.repository.listAddresses();
  }
}
