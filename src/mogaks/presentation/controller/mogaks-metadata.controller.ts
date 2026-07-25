import { Controller, Get, Inject } from '@nestjs/common';

import { successResponse } from '../../../common/http/api-response';
import { MogaksService } from '../../application/service/mogaks.service';

const COLORS = [
  '#475FFD',
  '#FF4C77',
  '#F98A08',
  '#11D796',
  '#FF6827',
  '#9C31FF',
  '#21CAFF',
  '#FF2F2F',
] as const;

@Controller('api/metadata')
export class MogaksMetadataController {
  constructor(@Inject(MogaksService) private readonly mogaks: MogaksService) {}

  @Get('mogak-categories')
  async listCategories() {
    return successResponse(await this.mogaks.listCategories());
  }

  @Get('colors')
  listColors() {
    return successResponse(COLORS.map((name) => ({ name })));
  }
}
