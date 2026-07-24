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
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { successResponse } from '../../../common/http/api-response';
import {
  MAX_POST_IMAGE_COUNT,
  postImageUploadOptions,
} from '../../../common/http/image-upload.options';
import { parseMultipartJson } from '../../../common/validation/multipart-json';
import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '../../../common/validation/request-schema';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { CurrentUser } from '../../auth/presentation/current-user.decorator';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';
import { PostsService } from '../application/posts.service';

const createPostSchema = z
  .object({
    targetDate: calendarDateSchema,
    contents: requiredTextSchema(1, 350),
  })
  .strict();

class CreatePostTransportRequest extends createZodDto(
  z
    .object({
      targetDate: z.unknown().optional(),
      contents: z.unknown().optional(),
      request: z.string().optional(),
    })
    .strict(),
) {}
class UpdatePostRequest extends createZodDto(
  z.object({ contents: requiredTextSchema(1, 350) }).strict(),
) {}
class CommentRequest extends createZodDto(
  z.object({ contents: requiredTextSchema(1, 200) }).strict(),
) {}
class LikePostRequest extends createZodDto(z.object({ postId: positiveIdSchema }).strict()) {}
class PostDateQuery extends createZodDto(z.object({ targetDate: calendarDateSchema }).strict()) {}
class PostPageQuery extends createZodDto(
  z
    .object({
      page: z.coerce.number().int().min(0).default(0),
      size: positiveIdSchema,
    })
    .strict(),
) {}
class JogakIdParam extends createZodDto(z.object({ jogakId: positiveIdSchema }).strict()) {}
class MogakIdParam extends createZodDto(z.object({ mogakId: positiveIdSchema }).strict()) {}
class PostIdParam extends createZodDto(z.object({ postId: positiveIdSchema }).strict()) {}
class PostCommentParam extends createZodDto(
  z.object({ postId: positiveIdSchema, commentId: positiveIdSchema }).strict(),
) {}

@Controller('api')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  @Post('jogaks/:jogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @UseInterceptors(FilesInterceptor('multipartFile', MAX_POST_IMAGE_COUNT, postImageUploadOptions))
  @HttpCode(HttpStatus.OK)
  async createPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: JogakIdParam,
    @Body() body: CreatePostTransportRequest,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const request = parseMultipartJson(body, createPostSchema);
    const uploadedFiles = (files ?? []).filter((file) => file.size > 0);
    if (uploadedFiles.length > 0) {
      await this.storage.uploadPostImages(uploadedFiles);
    }
    return successResponse(
      await this.posts.createPost(user.userId, {
        jogakId: params.jogakId,
        targetDate: request.targetDate,
        contents: request.contents,
      }),
    );
  }

  @Get('mogaks/:mogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listMogakPosts(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MogakIdParam,
    @Query() query: PostPageQuery,
  ) {
    return successResponse(
      await this.posts.listMogakPosts(user.userId, params.mogakId, query.page, query.size),
    );
  }

  @Get('jogaks/:jogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getPostByJogakAndDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: JogakIdParam,
    @Query() query: PostDateQuery,
  ) {
    return successResponse(
      await this.posts.getPostByJogakAndDate(user.userId, params.jogakId, query.targetDate),
    );
  }

  @Get('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getPost(@CurrentUser() user: AuthenticatedUser, @Param() params: PostIdParam) {
    return successResponse(await this.posts.getPost(user.userId, params.postId));
  }

  @Put('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PostIdParam,
    @Body() request: UpdatePostRequest,
  ) {
    const updated = await this.posts.updatePost(user.userId, params.postId, request.contents);
    return successResponse({
      id: updated.postId,
      contents: updated.contents,
      updatedAt: updated.updatedAt,
    });
  }

  @Delete('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async deletePost(@CurrentUser() user: AuthenticatedUser, @Param() params: PostIdParam) {
    await this.posts.deletePost(user.userId, params.postId);
    return successResponse({ deleted: true });
  }

  @Post('posts/:postId/comments')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PostIdParam,
    @Body() request: CommentRequest,
  ) {
    return successResponse(
      await this.posts.createComment(user.userId, params.postId, request.contents),
    );
  }

  @Get('posts/:postId/comments')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listComments(@Param() params: PostIdParam) {
    return successResponse(await this.posts.listComments(params.postId));
  }

  @Put('posts/:postId/comments/:commentId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PostCommentParam,
    @Body() request: CommentRequest,
  ) {
    return successResponse(
      await this.posts.updateComment(
        user.userId,
        params.postId,
        params.commentId,
        request.contents,
      ),
    );
  }

  @Delete('posts/:postId/comments/:commentId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PostCommentParam,
  ) {
    await this.posts.deleteComment(user.userId, params.postId, params.commentId);
    return successResponse({ deleted: true });
  }

  @Post('posts/like')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async toggleLike(@CurrentUser() user: AuthenticatedUser, @Body() request: LikePostRequest) {
    return successResponse(await this.posts.toggleLike(user.userId, request.postId));
  }
}
