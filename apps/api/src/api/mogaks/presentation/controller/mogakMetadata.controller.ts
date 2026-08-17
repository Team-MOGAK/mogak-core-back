import { Controller, Get, Inject } from '@nestjs/common';

import { successResponse } from '../../../common/http/apiResponse';
import { MogakService } from '../../../../core/mogaks/application/service/mogak.service';

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
export class MogakMetadataController {
  constructor(@Inject(MogakService) private readonly mogakService: MogakService) {}

  @Get('mogak-categories')
  async listCategories() {
    return successResponse(await this.mogakService.listCategories());
  }

  @Get('colors')
  listColors() {
    return successResponse(COLORS.map((name) => ({ name })));
  }
}
