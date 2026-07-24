import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { AppException } from '../../common/http/app.exception';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';
import {
  SocialRepository,
  type FeedCommentRecord,
  type FeedPostRecord,
} from '../infrastructure/social.repository';

@Injectable()
export class SocialService {
  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(STORAGE_PORT) private readonly storage?: StoragePort,
  ) {}

  async follow(userId: number, nickname: string): Promise<void> {
    const target = await this.requireTarget(nickname);
    if (target.id === userId) throw new AppException(AppErrorCode.INVALID_PARAMETER);
    if (!(await this.repository.createFollow({ followerId: userId, followingId: target.id }))) {
      throw new AppException(AppErrorCode.FOLLOW_ALREADY_EXISTS);
    }
  }

  async unfollow(userId: number, nickname: string): Promise<void> {
    const target = await this.requireTarget(nickname);
    if (target.id === userId) throw new AppException(AppErrorCode.INVALID_PARAMETER);
    if (!(await this.repository.deleteFollow({ followerId: userId, followingId: target.id }))) {
      throw new AppException(AppErrorCode.FOLLOW_NOT_FOUND);
    }
  }

  async getFollowCounts(nickname: string) {
    const target = await this.requireTarget(nickname);
    const [mentorCnt, motoCnt] = await Promise.all([
      this.repository.countMentors(target.id),
      this.repository.countMotos(target.id),
    ]);
    return { mentorCnt, motoCnt };
  }

  async listMotos(nickname: string) {
    return this.repository.listMotos((await this.requireTarget(nickname)).id);
  }

  async listMentors(nickname: string) {
    return this.repository.listMentors((await this.requireTarget(nickname)).id);
  }

  async listPacemakerPosts(userId: number, cursor: number, size: number) {
    return this.toFeed(
      await this.repository.listPacemakerPosts({ userId, limit: size, offset: cursor * size }),
      false,
    );
  }

  async listNetworkPosts(
    userId: number,
    page: number,
    size: number,
    sort: string,
    address?: string,
  ) {
    if (sort !== 'createdAt' && sort !== 'likeCnt') {
      throw new AppException(AppErrorCode.INVALID_PARAMETER);
    }
    const selectedAddress = address?.trim() || (await this.repository.findAddressName(userId));
    if (selectedAddress === null || selectedAddress === '') {
      throw new AppException(AppErrorCode.ADDRESS_NOT_FOUND);
    }
    const rows = await this.repository.listNetworkPosts({
      address: selectedAddress,
      sort,
      limit: size + 1,
      offset: page * size,
    });
    const content = await this.toFeed(rows.slice(0, size), true);
    return {
      content,
      size,
      number: page,
      numberOfElements: content.length,
      first: page === 0,
      last: rows.length <= size,
      empty: content.length === 0,
    };
  }

  private async requireTarget(nickname: string) {
    const normalized = nickname.trim();
    if (normalized.length === 0) throw new AppException(AppErrorCode.INVALID_PARAMETER);
    const target = await this.repository.findUserByNickname(normalized);
    if (target === null) throw new AppException(AppErrorCode.USER_NOT_FOUND);
    return target;
  }

  private async toFeed(posts: readonly FeedPostRecord[], summary: boolean) {
    const [images, comments] = await Promise.all([
      this.repository.listImages(posts.map((post) => post.id)),
      this.repository.listComments(posts.map((post) => post.id)),
    ]);
    return Promise.all(
      posts.map(async (post) => {
        const imgUrls = (
          await Promise.all(
            images
              .filter((image) => image.postId === post.id)
              .map((image) => this.url(image.storageKey)),
          )
        ).filter((url): url is string => url !== null);
        const base = {
          ...(summary ? { postId: post.id } : {}),
          author: await this.author(post),
          contents: post.contents,
          imgUrls,
          likeCnt: post.likeCount,
        };
        return summary
          ? { ...base, commentCnt: post.commentCount }
          : {
              ...base,
              comments: await Promise.all(
                comments
                  .filter((comment) => comment.postId === post.id)
                  .map((comment) => this.comment(comment)),
              ),
            };
      }),
    );
  }

  private async comment(comment: FeedCommentRecord) {
    return {
      commentId: comment.id,
      contents: comment.contents,
      createdAt: comment.createdAt,
      author: await this.author(comment),
    };
  }

  private async author(
    author: Pick<FeedPostRecord, 'authorId' | 'nickname' | 'job' | 'profileImageKey'>,
  ) {
    return {
      userId: author.authorId,
      nickname: author.nickname,
      job: author.job,
      profileImageUrl: await this.url(author.profileImageKey),
    };
  }

  private async url(storageKey: string | null) {
    return storageKey === null || this.storage === undefined
      ? null
      : this.storage.resolvePublicUrl(storageKey);
  }
}
