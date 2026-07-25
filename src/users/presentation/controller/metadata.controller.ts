import { Controller, Get, Inject } from '@nestjs/common';

import { successResponse } from '../../../common/http/api-response';
import { MetadataService } from '../../application/service/metadata.service';
import type { MetadataResponse } from '../type/metadata.response';

@Controller('api/metadata')
export class MetadataController {
  constructor(@Inject(MetadataService) private readonly metadata: MetadataService) {}

  @Get('jobs')
  async jobs() {
    return successResponse<MetadataResponse[]>(
      (await this.metadata.jobs()).map((item) => ({ name: item.name })),
    );
  }

  @Get('addresses')
  async addresses() {
    return successResponse<MetadataResponse[]>(
      (await this.metadata.addresses()).map((item) => ({ name: item.name })),
    );
  }
}
