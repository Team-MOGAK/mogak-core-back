import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import { successResponse } from '../../../common/http/apiResponse';
import {
  MAX_POST_IMAGE_COUNT,
  postImageUploadOptions,
} from '../../../common/http/imageUpload.options';
import { parseMultipartJson } from '../../../common/validation/multipartJson';
import type { AuthenticatedPrincipal as AuthenticatedUser } from '../../../auth/application/type/authenticatedPrincipal';
import { AccessTokenGuard } from '../../../auth/presentation/controller/accessToken.guard';
import { CurrentUser } from '../../../auth/presentation/controller/currentUser.decorator';
import { RegisteredUserGuard } from '../../../auth/presentation/controller/registeredUser.guard';
import { STORAGE_PORT, type StoragePort } from '../../../storage/application/storage.port';
import { ZodBody, ZodParams, ZodQuery } from '../../../common/validation/zodParameter.decorator';
import { PostsService } from '../../application/service/posts.service';
import {
  commentRequestSchema,
  createPostRequestSchema,
  createPostTransportSchema,
  jogakIdParamsSchema,
  likePostRequestSchema,
  mogakIdParamsSchema,
  postCommentParamsSchema,
  postDateQuerySchema,
  postIdParamsSchema,
  postPageQuerySchema,
  updatePostRequestSchema,
  type CommentRequest,
  type CreatePostTransportRequest,
  type JogakIdParams,
  type LikePostRequest,
  type MogakIdParams,
  type PostCommentParams,
  type PostDateQuery,
  type PostIdParams,
  type PostPageQuery,
  type UpdatePostRequest,
} from '../type/posts.request';

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
    @ZodParams(jogakIdParamsSchema) params: JogakIdParams,
    @ZodBody(createPostTransportSchema) body: CreatePostTransportRequest,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const request = parseMultipartJson(body, createPostRequestSchema);
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
    @ZodParams(mogakIdParamsSchema) params: MogakIdParams,
    @ZodQuery(postPageQuerySchema) query: PostPageQuery,
  ) {
    return successResponse(
      await this.posts.listMogakPosts(user.userId, params.mogakId, query.page, query.size),
    );
  }

  @Get('jogaks/:jogakId/posts')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getPostByJogakAndDate(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(jogakIdParamsSchema) params: JogakIdParams,
    @ZodQuery(postDateQuerySchema) query: PostDateQuery,
  ) {
    return successResponse(
      await this.posts.getPostByJogakAndDate(user.userId, params.jogakId, query.targetDate),
    );
  }

  @Get('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async getPost(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(postIdParamsSchema) params: PostIdParams,
  ) {
    return successResponse(await this.posts.getPost(user.userId, params.postId));
  }

  @Put('posts/:postId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(postIdParamsSchema) params: PostIdParams,
    @ZodBody(updatePostRequestSchema) request: UpdatePostRequest,
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
  async deletePost(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(postIdParamsSchema) params: PostIdParams,
  ) {
    await this.posts.deletePost(user.userId, params.postId);
    return successResponse({ deleted: true });
  }

  @Post('posts/:postId/comments')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(postIdParamsSchema) params: PostIdParams,
    @ZodBody(commentRequestSchema) request: CommentRequest,
  ) {
    return successResponse(
      await this.posts.createComment(user.userId, params.postId, request.contents),
    );
  }

  @Get('posts/:postId/comments')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async listComments(@ZodParams(postIdParamsSchema) params: PostIdParams) {
    return successResponse(await this.posts.listComments(params.postId));
  }

  @Put('posts/:postId/comments/:commentId')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  async updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParams(postCommentParamsSchema) params: PostCommentParams,
    @ZodBody(commentRequestSchema) request: CommentRequest,
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
    @ZodParams(postCommentParamsSchema) params: PostCommentParams,
  ) {
    await this.posts.deleteComment(user.userId, params.postId, params.commentId);
    return successResponse({ deleted: true });
  }

  @Post('posts/like')
  @UseGuards(AccessTokenGuard, RegisteredUserGuard)
  @HttpCode(HttpStatus.OK)
  async toggleLike(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(likePostRequestSchema) request: LikePostRequest,
  ) {
    return successResponse(await this.posts.toggleLike(user.userId, request.postId));
  }
}
