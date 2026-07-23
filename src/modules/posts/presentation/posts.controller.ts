import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
  validateSync,
} from 'class-validator';

import { successResponse } from '../../../common/http/api-response';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';
import { PostsService } from '../application/posts.service';

class CreatePostRequest {
  @IsDateString()
  targetDate!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 350)
  contents!: string;
}

class UpdatePostRequest {
  @IsString()
  @IsNotEmpty()
  @Length(1, 350)
  contents!: string;
}

class CommentRequest {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  contents!: string;
}

class LikePostRequest {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  postId!: number;
}

class PostDateQuery {
  @IsDateString()
  targetDate!: string;
}

class PostPageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page = 0;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  size!: number;
}

@Controller('api')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  @Post('jogaks/:jogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @UseInterceptors(FilesInterceptor('multipartFile'))
  @HttpCode(HttpStatus.OK)
  async createPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jogakId') jogakId: string,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const request = createPostRequest(body);
    const uploadedFiles = (files ?? []).filter((file) => file.size > 0);
    if (uploadedFiles.length > 0) {
      await this.storage.uploadPostImages(uploadedFiles);
    }
    return successResponse(
      await this.posts.createPost(user.userId, {
        jogakId: asSafeId(jogakId),
        targetDate: request.targetDate,
        contents: request.contents,
      }),
    );
  }

  @Get('mogaks/:mogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listMogakPosts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mogakId') mogakId: string,
    @Query() query: PostPageQuery,
  ) {
    return successResponse(
      await this.posts.listMogakPosts(user.userId, asSafeId(mogakId), query.page, query.size),
    );
  }

  @Get('jogaks/:jogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getPostByJogakAndDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jogakId') jogakId: string,
    @Query() query: PostDateQuery,
  ) {
    return successResponse(
      await this.posts.getPostByJogakAndDate(user.userId, asSafeId(jogakId), query.targetDate),
    );
  }

  @Get('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getPost(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    return successResponse(await this.posts.getPost(user.userId, asSafeId(postId)));
  }

  @Put('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() request: UpdatePostRequest,
  ) {
    const updated = await this.posts.updatePost(user.userId, asSafeId(postId), request.contents);
    return successResponse({
      id: updated.postId,
      contents: updated.contents,
      updatedAt: updated.updatedAt,
    });
  }

  @Delete('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async deletePost(@CurrentUser() user: AuthenticatedUser, @Param('postId') postId: string) {
    await this.posts.deletePost(user.userId, asSafeId(postId));
    return successResponse({ deleted: true });
  }

  @Post('posts/:postId/comments')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() request: CommentRequest,
  ) {
    return successResponse(
      await this.posts.createComment(user.userId, asSafeId(postId), request.contents),
    );
  }

  @Get('posts/:postId/comments')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listComments(@Param('postId') postId: string) {
    return successResponse(await this.posts.listComments(asSafeId(postId)));
  }

  @Put('posts/:postId/comments/:commentId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() request: CommentRequest,
  ) {
    return successResponse(
      await this.posts.updateComment(
        user.userId,
        asSafeId(postId),
        asSafeId(commentId),
        request.contents,
      ),
    );
  }

  @Delete('posts/:postId/comments/:commentId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    await this.posts.deleteComment(user.userId, asSafeId(postId), asSafeId(commentId));
    return successResponse({ deleted: true });
  }

  @Post('posts/like')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async toggleLike(@CurrentUser() user: AuthenticatedUser, @Body() request: LikePostRequest) {
    return successResponse(await this.posts.toggleLike(user.userId, request.postId));
  }
}

function createPostRequest(body: unknown): CreatePostRequest {
  let input = body;
  if (isRecord(body) && typeof body.request === 'string') {
    try {
      input = JSON.parse(body.request) as unknown;
    } catch {
      throw new AppException(AppErrorCode.INVALID_PARAMETER);
    }
  }
  const request = plainToInstance(CreatePostRequest, input);
  if (
    validateSync(request, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).length > 0
  ) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  return request;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asSafeId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  return id;
}
