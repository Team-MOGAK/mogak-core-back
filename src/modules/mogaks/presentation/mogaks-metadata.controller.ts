import { Controller, Get, Inject } from '@nestjs/common';

import { successResponse } from '../../../common/http/api-response';
import { MogaksService } from '../application/mogaks.service';

@Controller('api/metadata')
export class MogaksMetadataController {
  constructor(@Inject(MogaksService) private readonly mogaks: MogaksService) {}

  @Get('mogak-categories')
  async listCategories() {
    return successResponse(await this.mogaks.listCategories());
  }
}
