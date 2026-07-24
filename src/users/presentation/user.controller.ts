import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { successResponse } from '../../common/http/api-response';
import { profileImageUploadOptions } from '../../common/http/image-upload.options';
import { requiredTextSchema } from '../../common/validation/request-schema';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { UserService } from '../application/user.service';

const consentAgreementSchema = z
  .object({
    consentItemId: z.number().int().positive(),
    agreed: z.boolean(),
  })
  .strict();

class NicknameRequest extends createZodDto(
  z.object({ nickname: requiredTextSchema(2, 10) }).strict(),
) {}

class JobRequest extends createZodDto(z.object({ job: requiredTextSchema(1, 100) }).strict()) {}

class JoinRequest extends createZodDto(
  z
    .object({
      nickname: requiredTextSchema(2, 10),
      job: requiredTextSchema(1, 100),
      address: requiredTextSchema(1, 100),
      consents: z.array(consentAgreementSchema).optional(),
    })
    .strict(),
) {}

@Controller('api/users')
export class UserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Post('nickname/verify')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyNickname(@Body() request: NicknameRequest) {
    await this.users.verifyNickname(request.nickname);
    return successResponse({});
  }

  @Post('join')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async join(@CurrentUser() current: AuthenticatedUser, @Body() request: JoinRequest) {
    return successResponse(
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
  async profile(@CurrentUser() current: AuthenticatedUser) {
    return successResponse(await this.users.profile(current.userId));
  }

  @Put('profile/nickname')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateNickname(
    @CurrentUser() current: AuthenticatedUser,
    @Body() request: NicknameRequest,
  ) {
    await this.users.updateNickname(current.userId, request.nickname);
    return successResponse({});
  }

  @Put('profile/job')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateJob(@CurrentUser() current: AuthenticatedUser, @Body() request: JobRequest) {
    await this.users.updateJob(current.userId, request.job);
    return successResponse({});
  }

  @Put('profile/image')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @UseInterceptors(FileInterceptor('multipartFile', profileImageUploadOptions))
  async updateProfileImage(
    @CurrentUser() current: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.users.updateProfileImage(current.userId, file);
    return successResponse({});
  }
}
