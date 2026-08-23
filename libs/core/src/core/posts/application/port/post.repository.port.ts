import type {
  CreateCommentCommand,
  CreatePostCommand,
  UpdateCommentCommand,
  UpdatePostCommand,
} from '../type/post.command';
import type { MogakPostsQuery } from '../type/post.query';
import type {
  PostCommentResult,
  PostDetailResult,
  PostImageResult,
  ToggleLikeResult,
} from '../type/post.result';

export const POST_REPOSITORY = Symbol('POST_REPOSITORY');

export interface PostRepositoryPort {
  createForOccurrence(
    command: CreatePostCommand & Readonly<{ jogakTitleSnapshot: string }>,
  ): Promise<
    | Readonly<{
        type: 'CREATED';
        post: Readonly<{
          id: number;
          jogakExecutionId: number;
          authorId: number;
          jogakId: number;
          scheduledDate: string;
          contents: string;
          createdAt: Date;
        }>;
      }>
    | Readonly<{ type: 'DUPLICATE' }>
  >;
  findPost(postId: number): Promise<Readonly<{ id: number }> | null>;
  updateOwnedPost(
    command: UpdatePostCommand,
  ): Promise<Readonly<{ id: number; contents: string; updatedAt: Date }> | null>;
  deleteOwnedPost(input: Readonly<{ postId: number; authorId: number }>): Promise<boolean>;
  findOwnedPostByOccurrence(
    userId: number,
    jogakId: number,
    scheduledDate: string,
  ): Promise<PostDetailResult | null>;
  findOwnedPost(userId: number, postId: number): Promise<PostDetailResult | null>;
  listOwnedMogakPosts(query: MogakPostsQuery): Promise<PostDetailResult[]>;
  listImagesForPosts(postIds: readonly number[]): Promise<PostImageResult[]>;
  listCommentIds(postId: number): Promise<number[]>;
  toggleLike(input: Readonly<{ postId: number; userId: number }>): Promise<ToggleLikeResult>;
  listComments(postId: number): Promise<PostCommentResult[]>;
  createComment(command: CreateCommentCommand): Promise<PostCommentResult>;
  findComment(postId: number, commentId: number): Promise<PostCommentResult | null>;
  updateComment(command: UpdateCommentCommand): Promise<PostCommentResult | null>;
  deleteComment(
    input: Readonly<{ postId: number; commentId: number; authorId: number }>,
  ): Promise<boolean>;
}
