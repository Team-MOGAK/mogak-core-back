import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { SocialRepository } from '../infrastructure/social.repository';

@Injectable()
export class SocialService {
  constructor(@Inject(SocialRepository) private readonly repository: SocialRepository) {}

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

  private async requireTarget(nickname: string) {
    const normalized = nickname.trim();
    if (normalized.length === 0) throw new AppException(AppErrorCode.INVALID_PARAMETER);
    const target = await this.repository.findUserByNickname(normalized);
    if (target === null) throw new AppException(AppErrorCode.USER_NOT_FOUND);
    return target;
  }
}
