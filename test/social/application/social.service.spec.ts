import { CoreError } from '../../../apps/api/src/core/common/error/coreError';
import { jest } from '@jest/globals';
import { testMock } from '../../testMock';

import type { SocialRepositoryPort } from '../../../apps/api/src/core/social/application/port/social.repository.port';
import { SocialService } from '../../../apps/api/src/core/social/application/service/social.service';

function repository(): SocialRepositoryPort {
  return {
    findUserByNickname: testMock(),
    createFollow: testMock(),
    deleteFollow: testMock(),
    countMotos: testMock(),
    countMentors: testMock(),
    listMotos: testMock(),
    listMentors: testMock(),
    findAddressName: testMock(),
    listPacemakerPosts: testMock(),
    listNetworkPosts: testMock(),
    listImages: testMock(),
    listComments: testMock(),
  } as unknown as SocialRepositoryPort;
}

describe('소셜 팔로우 서비스', () => {
  it('팔로우 입력으로 닉네임을 유지하고 사용자 식별자 두 개만 저장한다', async () => {
    const social = repository();
    jest.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    jest.mocked(social.createFollow).mockResolvedValue(true);
    const service = new SocialService(social);

    await expect(service.follow(7, '모각러')).resolves.toBeUndefined();
    expect(social.createFollow).toHaveBeenCalledWith({ followerId: 7, followingId: 8 });
  });

  it('사전 조회 lock 없이 삽입 충돌을 F001 오류로 변환한다', async () => {
    const social = repository();
    jest.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    jest.mocked(social.createFollow).mockResolvedValue(false);
    const service = new SocialService(social);

    await expect(service.follow(7, '모각러')).rejects.toEqual(
      new CoreError('FOLLOW_ALREADY_EXISTS'),
    );
  });

  it('저장 전에 자기 자신 팔로우를 거부한다', async () => {
    const social = repository();
    jest.mocked(social.findUserByNickname).mockResolvedValue({ id: 7 });
    const service = new SocialService(social);

    await expect(service.follow(7, '나')).rejects.toEqual(new CoreError('INVALID_PARAMETER'));
    expect(social.createFollow).not.toHaveBeenCalled();
  });

  it('소유한 삭제 대상이 없으면 F002 오류로 변환한다', async () => {
    const social = repository();
    jest.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    jest.mocked(social.deleteFollow).mockResolvedValue(false);
    const service = new SocialService(social);

    await expect(service.unfollow(7, '모각러')).rejects.toEqual(new CoreError('FOLLOW_NOT_FOUND'));
  });

  it('원본 행에서 멘토와 모토 수를 계산해 반환한다', async () => {
    const social = repository();
    jest.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    jest.mocked(social.countMentors).mockResolvedValue(3);
    jest.mocked(social.countMotos).mockResolvedValue(5);
    const service = new SocialService(social);

    await expect(service.getFollowCounts('모각러')).resolves.toEqual({ mentorCnt: 3, motoCnt: 5 });
  });

  it('명시적인 관계 방향을 통해 멘토와 모토 사용자 요약을 반환한다', async () => {
    const social = repository();
    jest.mocked(social.findUserByNickname).mockResolvedValue({ id: 8 });
    jest.mocked(social.listMotos).mockResolvedValue([{ nickname: '팔로워', job: '개발/데이터' }]);
    jest.mocked(social.listMentors).mockResolvedValue([{ nickname: '팔로잉', job: null }]);
    const service = new SocialService(social);

    await expect(service.listMotos('모각러')).resolves.toEqual([
      { nickname: '팔로워', job: '개발/데이터' },
    ]);
    await expect(service.listMentors('모각러')).resolves.toEqual([
      { nickname: '팔로잉', job: null },
    ]);
  });

  it('인증 사용자의 주소와 계산한 수와 중첩 작성자로 네트워크 게시글을 반환한다', async () => {
    const social = repository();
    jest.mocked(social.findAddressName).mockResolvedValue('서울');
    jest.mocked(social.listNetworkPosts).mockResolvedValue([
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
    jest.mocked(social.listImages).mockResolvedValue([]);
    jest.mocked(social.listComments).mockResolvedValue([]);
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

  it('게시글을 조회하기 전에 지원하지 않는 네트워크 정렬을 거부한다', async () => {
    const social = repository();
    const service = new SocialService(social);

    await expect(service.listNetworkPosts(7, 0, 10, 'viewCnt')).rejects.toEqual(
      new CoreError('INVALID_PARAMETER'),
    );
    expect(social.listNetworkPosts).not.toHaveBeenCalled();
  });
});
