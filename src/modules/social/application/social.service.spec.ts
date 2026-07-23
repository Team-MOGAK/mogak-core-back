import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { SocialRepository } from '../infrastructure/social.repository';
import { SocialService } from './social.service';

function repository(): SocialRepository {
  return {
    findUserByNickname: vi.fn(),
    createFollow: vi.fn(),
    deleteFollow: vi.fn(),
    countMotos: vi.fn(),
    countMentors: vi.fn(),
    listMotos: vi.fn(),
    listMentors: vi.fn(),
    findAddressName: vi.fn(),
    listPacemakerPosts: vi.fn(),
    listNetworkPosts: vi.fn(),
    listImages: vi.fn(),
    listComments: vi.fn(),
  } as unknown as SocialRepository;
}

describe('SocialService follows', () => {
  it('keeps nickname as the follow input while storing only two user IDs', async () => {
    const social = repository();
    vi.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    vi.mocked(social.createFollow).mockResolvedValue(true);
    const service = new SocialService(social);

    await expect(service.follow(7, '모각러')).resolves.toBeUndefined();
    expect(social.createFollow).toHaveBeenCalledWith({ followerId: 7, followingId: 8 });
  });

  it('maps an insert conflict to F001 without a pre-read lock', async () => {
    const social = repository();
    vi.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    vi.mocked(social.createFollow).mockResolvedValue(false);
    const service = new SocialService(social);

    await expect(service.follow(7, '모각러')).rejects.toEqual(
      new AppException(AppErrorCode.FOLLOW_ALREADY_EXISTS),
    );
  });

  it('rejects self-follow before writing', async () => {
    const social = repository();
    vi.mocked(social.findUserByNickname).mockResolvedValue({ id: 7 });
    const service = new SocialService(social);

    await expect(service.follow(7, '나')).rejects.toEqual(
      new AppException(AppErrorCode.INVALID_PARAMETER),
    );
    expect(social.createFollow).not.toHaveBeenCalled();
  });

  it('maps an absent owned delete to F002', async () => {
    const social = repository();
    vi.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    vi.mocked(social.deleteFollow).mockResolvedValue(false);
    const service = new SocialService(social);

    await expect(service.unfollow(7, '모각러')).rejects.toEqual(
      new AppException(AppErrorCode.FOLLOW_NOT_FOUND),
    );
  });

  it('returns mentor and moto counts from source rows', async () => {
    const social = repository();
    vi.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    vi.mocked(social.countMentors).mockResolvedValue(3);
    vi.mocked(social.countMotos).mockResolvedValue(5);
    const service = new SocialService(social);

    await expect(service.getFollowCounts('모각러')).resolves.toEqual({ mentorCnt: 3, motoCnt: 5 });
  });

  it('returns mentor and moto user summaries through explicit relationship directions', async () => {
    const social = repository();
    vi.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    vi.mocked(social.listMotos).mockResolvedValue([{ nickname: '팔로워', job: '개발/데이터' }]);
    vi.mocked(social.listMentors).mockResolvedValue([{ nickname: '팔로잉', job: null }]);
    const service = new SocialService(social);

    await expect(service.listMotos('모각러')).resolves.toEqual([
      { nickname: '팔로워', job: '개발/데이터' },
    ]);
    await expect(service.listMentors('모각러')).resolves.toEqual([
      { nickname: '팔로잉', job: null },
    ]);
  });

  it('uses the authenticated address, derived counts, and nested author for network posts', async () => {
    const social = repository();
    vi.mocked(social.findAddressName).mockResolvedValue('서울');
    vi.mocked(social.listNetworkPosts).mockResolvedValue([
      {
        id: 31,
        authorId: 8,
        nickname: '모각러',
        job: '개발/데이터',
        profileImageKey: null,
        contents: '회고',
        likeCount: 4,
        commentCount: 2,
      },
    ]);
    vi.mocked(social.listImages).mockResolvedValue([]);
    vi.mocked(social.listComments).mockResolvedValue([]);
    const service = new SocialService(social);

    await expect(service.listNetworkPosts(7, 0, 10, 'likeCnt')).resolves.toMatchObject({
      content: [
        {
          postId: 31,
          author: { userId: 8, nickname: '모각러', profileImageUrl: null, job: '개발/데이터' },
          likeCnt: 4,
          commentCnt: 2,
        },
      ],
    });
    expect(social.listNetworkPosts).toHaveBeenCalledWith({
      address: '서울',
      sort: 'likeCnt',
      limit: 11,
      offset: 0,
    });
  });

  it('rejects an unsupported network sort before querying posts', async () => {
    const social = repository();
    const service = new SocialService(social);

    await expect(service.listNetworkPosts(7, 0, 10, 'viewCnt')).rejects.toEqual(
      new AppException(AppErrorCode.INVALID_PARAMETER),
    );
    expect(social.listNetworkPosts).not.toHaveBeenCalled();
  });
});
