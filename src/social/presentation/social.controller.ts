import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { successResponse } from '../../common/http/api-response';
import type { AuthenticatedPrincipal as AuthenticatedUser } from '../../auth/application/type/authenticated-principal';
import { AccessTokenGuard } from '../../auth/presentation/controller/access-token.guard';
import { CurrentUser } from '../../auth/presentation/controller/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/controller/registered-user.guard';
import { SocialService } from '../application/social.service';

const positiveSafeIntegerSchema = z.coerce.number().int().positive().refine(Number.isSafeInteger);

class NicknameParam extends createZodDto(z.object({ nickname: z.string().min(1) }).strict()) {}
class PacemakerQuery extends createZodDto(
  z
    .object({
      cursor: z.coerce.number().int().min(0),
      size: positiveSafeIntegerSchema,
    })
    .strict(),
) {}
class NetworkQuery extends createZodDto(
  z
    .object({
      page: z.coerce.number().int().min(0).default(0),
      size: positiveSafeIntegerSchema,
      sort: z.enum(['createdAt', 'likeCnt']).default('createdAt'),
      address: z.string().optional(),
    })
    .strict(),
) {}

@Controller('api')
@UseGuards(AccessTokenGuard, RegisteredUserGuard)
export class SocialController {
  constructor(@Inject(SocialService) private readonly social: SocialService) {}

  @Post('users/follows/:nickname')
  @HttpCode(HttpStatus.OK)
  async follow(@CurrentUser() user: AuthenticatedUser, @Param() params: NicknameParam) {
    await this.social.follow(user.userId, params.nickname);
    return successResponse('SUCCESS');
  }
  @Delete('users/follows/:nickname')
  async unfollow(@CurrentUser() user: AuthenticatedUser, @Param() params: NicknameParam) {
    await this.social.unfollow(user.userId, params.nickname);
    return successResponse('SUCCESS');
  }
  @Get('users/follows/counts/:nickname')
  async counts(@Param() params: NicknameParam) {
    return successResponse(await this.social.getFollowCounts(params.nickname));
  }
  @Get('users/follows/:nickname/motos')
  async motos(@Param() params: NicknameParam) {
    return successResponse(await this.social.listMotos(params.nickname));
  }
  @Get('users/follows/:nickname/mentors')
  async mentors(@Param() params: NicknameParam) {
    return successResponse(await this.social.listMentors(params.nickname));
  }
  @Get('posts/pacemakers')
  async pacemakers(@CurrentUser() user: AuthenticatedUser, @Query() query: PacemakerQuery) {
    return successResponse(
      await this.social.listPacemakerPosts(user.userId, query.cursor, query.size),
    );
  }
  @Get('posts')
  async network(@CurrentUser() user: AuthenticatedUser, @Query() query: NetworkQuery) {
    return successResponse(
      await this.social.listNetworkPosts(
        user.userId,
        query.page,
        query.size,
        query.sort,
        query.address,
      ),
    );
  }
}
