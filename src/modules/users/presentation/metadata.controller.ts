import { Controller, Get, Inject } from '@nestjs/common';

import { successResponse } from '../../../common/http/api-response';
import { MetadataService } from '../application/metadata.service';

@Controller('api/metadata')
export class MetadataController {
  constructor(@Inject(MetadataService) private readonly metadata: MetadataService) {}

  @Get('jobs')
  async jobs() {
    return successResponse((await this.metadata.jobs()).map((item) => ({ name: item.name })));
  }

  @Get('addresses')
  async addresses() {
    return successResponse((await this.metadata.addresses()).map((item) => ({ name: item.name })));
  }
}
