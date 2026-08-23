import type { FollowCommand } from '../type/social.command';
import type { NetworkPostsQuery, PacemakerPostsQuery } from '../type/social.query';
import type {
  FeedCommentResult,
  FeedImageResult,
  FeedPostResult,
  SocialUserResult,
  SocialUserSummaryResult,
} from '../type/social.result';

export const SOCIAL_REPOSITORY = Symbol('SOCIAL_REPOSITORY');

export interface SocialRepositoryPort {
  findUserByNickname(nickname: string): Promise<SocialUserResult | null>;
  createFollow(command: FollowCommand): Promise<void>;
  deleteFollow(command: FollowCommand): Promise<void>;
  countMotos(userId: number): Promise<number>;
  countMentors(userId: number): Promise<number>;
  listMotos(userId: number): Promise<SocialUserSummaryResult[]>;
  listMentors(userId: number): Promise<SocialUserSummaryResult[]>;
  findAddressName(userId: number): Promise<string | null>;
  listPacemakerPosts(query: PacemakerPostsQuery): Promise<FeedPostResult[]>;
  listNetworkPosts(query: NetworkPostsQuery): Promise<FeedPostResult[]>;
  listImages(postIds: readonly number[]): Promise<FeedImageResult[]>;
  listComments(postIds: readonly number[]): Promise<FeedCommentResult[]>;
}
