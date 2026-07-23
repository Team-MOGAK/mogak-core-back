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
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

import { successResponse } from '../../../common/http/api-response';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { UserService } from '../application/user.service';

class NicknameRequest {
  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  nickname!: string;
}

class JobRequest {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  job!: string;
}

class ConsentAgreementRequest {
  @IsInt()
  @IsPositive()
  consentItemId!: number;

  @IsBoolean()
  agreed!: boolean;
}

class JoinRequest {
  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  nickname!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  job!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  address!: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConsentAgreementRequest)
  consents?: ConsentAgreementRequest[];
}

@Controller('api/users')
export class UserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Post('nickname/verify')
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
  @UseGuards(AccessTokenGuard)
  async profile(@CurrentUser() current: AuthenticatedUser) {
    return successResponse(await this.users.profile(current.userId));
  }

  @Put('profile/nickname')
  @UseGuards(AccessTokenGuard)
  async updateNickname(
    @CurrentUser() current: AuthenticatedUser,
    @Body() request: NicknameRequest,
  ) {
    await this.users.updateNickname(current.userId, request.nickname);
    return successResponse({});
  }

  @Put('profile/job')
  @UseGuards(AccessTokenGuard)
  async updateJob(@CurrentUser() current: AuthenticatedUser, @Body() request: JobRequest) {
    await this.users.updateJob(current.userId, request.job);
    return successResponse({});
  }

  @Put('profile/image')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FileInterceptor('multipartFile'))
  async updateProfileImage(
    @CurrentUser() current: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.users.updateProfileImage(current.userId, file);
    return successResponse({});
  }
}
