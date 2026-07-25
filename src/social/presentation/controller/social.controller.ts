import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../../../auth/application/type/authenticated-principal';
import { AccessTokenGuard } from '../../../auth/presentation/controller/access-token.guard';
import { CurrentUser } from '../../../auth/presentation/controller/current-user.decorator';
import { RegisteredUserGuard } from '../../../auth/presentation/controller/registered-user.guard';
import { successResponse } from '../../../common/http/api-response';
import { ZodParams, ZodQuery } from '../../../common/validation/zod-parameter.decorator';
import { SocialService } from '../../application/service/social.service';
import {
  networkPostsQuerySchema,
  nicknameParamsSchema,
  pacemakerPostsQuerySchema,
  type NetworkPostsQueryRequest,
  type NicknameParams,
  type PacemakerPostsQueryRequest,
} from '../type/social.request';
import type {
  FollowCountsResponse,
  FollowUserResponse,
  NetworkPostsResponse,
  PacemakerPostResponse,
} from '../type/social.response';

@Controller('api')
@UseGuards(AccessTokenGuard, RegisteredUserGuard)
export class SocialController {
  constructor(@Inject(SocialService) private readonly social: SocialService) {}

  @Post('users/follows/:nickname')
  @HttpCode(HttpStatus.OK)
  async follow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @ZodParams(nicknameParamsSchema) params: NicknameParams,
  ) {
    await this.social.follow(user.userId, params.nickname);
    return successResponse('SUCCESS');
  }

  @Delete('users/follows/:nickname')
  async unfollow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @ZodParams(nicknameParamsSchema) params: NicknameParams,
  ) {
    await this.social.unfollow(user.userId, params.nickname);
    return successResponse('SUCCESS');
  }

  @Get('users/follows/counts/:nickname')
  async counts(@ZodParams(nicknameParamsSchema) params: NicknameParams) {
    return successResponse<FollowCountsResponse>(await this.social.getFollowCounts(params.nickname));
  }

  @Get('users/follows/:nickname/motos')
  async motos(@ZodParams(nicknameParamsSchema) params: NicknameParams) {
    return successResponse<FollowUserResponse[]>(await this.social.listMotos(params.nickname));
  }

  @Get('users/follows/:nickname/mentors')
  async mentors(@ZodParams(nicknameParamsSchema) params: NicknameParams) {
    return successResponse<FollowUserResponse[]>(await this.social.listMentors(params.nickname));
  }

  @Get('posts/pacemakers')
  async pacemakers(
    @CurrentUser() user: AuthenticatedPrincipal,
    @ZodQuery(pacemakerPostsQuerySchema) query: PacemakerPostsQueryRequest,
  ) {
    return successResponse<PacemakerPostResponse[]>(
      await this.social.listPacemakerPosts(user.userId, query.cursor, query.size),
    );
  }

  @Get('posts')
  async network(
    @CurrentUser() user: AuthenticatedPrincipal,
    @ZodQuery(networkPostsQuerySchema) query: NetworkPostsQueryRequest,
  ) {
    return successResponse<NetworkPostsResponse>(
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
