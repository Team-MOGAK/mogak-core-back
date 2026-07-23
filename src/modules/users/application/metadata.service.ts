import { Inject, Injectable } from '@nestjs/common';

import { MetadataRepository } from '../infrastructure/metadata.repository';

@Injectable()
export class MetadataService {
  constructor(@Inject(MetadataRepository) private readonly repository: MetadataRepository) {}

  async jobs() {
    return this.repository.listJobs();
  }

  async addresses() {
    return this.repository.listAddresses();
  }
}
