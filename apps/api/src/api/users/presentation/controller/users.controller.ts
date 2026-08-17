import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import type { AuthenticatedPrincipal } from '../../../../core/auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '../../../auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '../../../auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '../../../auth/presentation/controller/registeredUser.guard';
import { successResponse } from '../../../common/http/apiResponse';
import { profileImageUploadOptions } from '../../../common/http/imageUpload.options';
import { ZodBody } from '../../../common/validation/zodParameter.decorator';
import { UserService } from '../../../../core/users/application/service/user.service';
import {
  jobRequestSchema,
  joinUserRequestSchema,
  nicknameRequestSchema,
  type JobRequest,
  type JoinUserRequest,
  type NicknameRequest,
} from '../type/users.request';
import type { JoinUserResponse, UserProfileResponse } from '../type/users.response';

@Controller('api/users')
export class UsersController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Post('nickname/verify')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyNickname(@ZodBody(nicknameRequestSchema) request: NicknameRequest) {
    await this.users.verifyNickname(request.nickname);
    return successResponse({});
  }

  @Post('join')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async join(
    @CurrentUser() current: AuthenticatedPrincipal,
    @ZodBody(joinUserRequestSchema) request: JoinUserRequest,
  ) {
    return successResponse<JoinUserResponse>(
      await this.users.join(current, {
        nickname: request.nickname,
        job: request.job,
        address: request.address,
        consents: request.consents ?? [],
      }),
    );
  }

  @Get('profile')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async profile(@CurrentUser() current: AuthenticatedPrincipal) {
    return successResponse<UserProfileResponse>(await this.users.profile(current.userId));
  }

  @Put('profile/nickname')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateNickname(
    @CurrentUser() current: AuthenticatedPrincipal,
    @ZodBody(nicknameRequestSchema) request: NicknameRequest,
  ) {
    await this.users.updateNickname(current.userId, request.nickname);
    return successResponse({});
  }

  @Put('profile/job')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateJob(
    @CurrentUser() current: AuthenticatedPrincipal,
    @ZodBody(jobRequestSchema) request: JobRequest,
  ) {
    await this.users.updateJob(current.userId, request.job);
    return successResponse({});
  }

  @Put('profile/image')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @UseInterceptors(FileInterceptor('multipartFile', profileImageUploadOptions))
  async updateProfileImage(
    @CurrentUser() current: AuthenticatedPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.users.updateProfileImage(current.userId, file);
    return successResponse({});
  }
}
