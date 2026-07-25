import type {
  CreateCommentCommand,
  CreatePostCommand,
  UpdateCommentCommand,
  UpdatePostCommand,
} from '../type/post.command';
import type { MogakPostsQuery } from '../type/post.query';
import type {
  PostCommentProjection,
  PostDetailProjection,
  PostImageProjection,
  ToggleLikeResult,
} from '../type/post.result';

export const POSTS_REPOSITORY = Symbol('POSTS_REPOSITORY');

export interface PostsRepositoryPort {
  createForOccurrence(command: CreatePostCommand & Readonly<{ jogakTitleSnapshot: string }> ): Promise<
    | Readonly<{ type: 'CREATED'; post: Readonly<{ id: number; jogakExecutionId: number; authorId: number; jogakId: number; scheduledDate: string; contents: string; createdAt: Date }> }>
    | Readonly<{ type: 'DUPLICATE' }>
  >;
  findPost(postId: number): Promise<Readonly<{ id: number }> | null>;
  updateOwnedPost(command: UpdatePostCommand): Promise<Readonly<{ id: number; contents: string; updatedAt: Date }> | null>;
  deleteOwnedPost(input: Readonly<{ postId: number; authorId: number }>): Promise<boolean>;
  findOwnedPostByOccurrence(userId: number, jogakId: number, scheduledDate: string): Promise<PostDetailProjection | null>;
  findOwnedPost(userId: number, postId: number): Promise<PostDetailProjection | null>;
  listOwnedMogakPosts(query: MogakPostsQuery): Promise<PostDetailProjection[]>;
  listImagesForPosts(postIds: readonly number[]): Promise<PostImageProjection[]>;
  listCommentIds(postId: number): Promise<number[]>;
  toggleLike(input: Readonly<{ postId: number; userId: number }>): Promise<ToggleLikeResult>;
  listComments(postId: number): Promise<PostCommentProjection[]>;
  createComment(command: CreateCommentCommand): Promise<PostCommentProjection>;
  findComment(postId: number, commentId: number): Promise<PostCommentProjection | null>;
  updateComment(command: UpdateCommentCommand): Promise<PostCommentProjection | null>;
  deleteComment(input: Readonly<{ postId: number; commentId: number; authorId: number }>): Promise<boolean>;
}
