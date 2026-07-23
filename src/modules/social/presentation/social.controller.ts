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
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

import { successResponse } from '../../../common/http/api-response';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { SocialService } from '../application/social.service';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) page = 0;
  @Type(() => Number) @IsInt() @IsPositive() size!: number;
}
class PacemakerQuery {
  @Type(() => Number) @IsInt() @Min(0) cursor!: number;
  @Type(() => Number) @IsInt() @IsPositive() size!: number;
}
class NetworkQuery extends PageQuery {
  @IsOptional() @IsIn(['createdAt', 'likeCnt']) sort = 'createdAt';
  @IsOptional() @IsString() address?: string;
}

@Controller('api')
@UseGuards(AccessTokenGuard, RegisteredUserGuard)
export class SocialController {
  constructor(@Inject(SocialService) private readonly social: SocialService) {}

  @Post('users/follows/:nickname')
  @HttpCode(HttpStatus.OK)
  async follow(@CurrentUser() user: AuthenticatedUser, @Param('nickname') nickname: string) {
    await this.social.follow(user.userId, nickname);
    return successResponse('SUCCESS');
  }
  @Delete('users/follows/:nickname')
  async unfollow(@CurrentUser() user: AuthenticatedUser, @Param('nickname') nickname: string) {
    await this.social.unfollow(user.userId, nickname);
    return successResponse('SUCCESS');
  }
  @Get('users/follows/counts/:nickname')
  async counts(@Param('nickname') nickname: string) {
    return successResponse(await this.social.getFollowCounts(nickname));
  }
  @Get('users/follows/:nickname/motos')
  async motos(@Param('nickname') nickname: string) {
    return successResponse(await this.social.listMotos(nickname));
  }
  @Get('users/follows/:nickname/mentors')
  async mentors(@Param('nickname') nickname: string) {
    return successResponse(await this.social.listMentors(nickname));
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
