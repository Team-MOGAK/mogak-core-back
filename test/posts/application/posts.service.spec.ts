import { jest } from '@jest/globals';
import { testMock } from '../../testMock';

import { AppErrorCode } from '../../../src/common/http/appErrorCode';
import { DomainException } from '../../../src/common/http/domain.exception';
import type { OwnedMogakPort } from '../../../src/mogaks/application/port/ownedMogak.port';
import type { OwnedOccurrencePort } from '../../../src/mogaks/application/port/ownedOccurrence.port';
import type { StoragePort } from '../../../src/storage/application/storage.port';
import type { PostsRepositoryPort } from '../../../src/posts/application/port/posts.repository.port';
import { PostsService } from '../../../src/posts/application/service/posts.service';

function repository(): PostsRepositoryPort {
  return {
    createForOccurrence: testMock(),
    findPost: testMock(),
    toggleLike: testMock(),
    listComments: testMock(),
    createComment: testMock(),
    findComment: testMock(),
    updateComment: testMock(),
    deleteComment: testMock(),
    updateOwnedPost: testMock(),
    deleteOwnedPost: testMock(),
    findOwnedPostByOccurrence: testMock(),
    findOwnedPost: testMock(),
    listImagesForPosts: testMock(),
    listCommentIds: testMock(),
    listOwnedMogakPosts: testMock(),
  } as unknown as PostsRepositoryPort;
}

function jogaks(): OwnedOccurrencePort {
  return {
    resolveOwnedOccurrence: testMock(),
  } as unknown as OwnedOccurrencePort;
}

function storage(): StoragePort {
  return {
    resolvePublicUrl: testMock(),
  } as unknown as StoragePort;
}

function mogaks(): OwnedMogakPort {
  return {
    resolveOwnedMogak: testMock(),
  } as unknown as OwnedMogakPort;
}

describe('게시글 서비스', () => {
  it('소유한 가상 발생에 게시글 하나를 만들고 현재 조각 제목을 기록한다', async () => {
    const posts = repository();
    const occurrences = jogaks();
    jest.mocked(occurrences.resolveOwnedOccurrence).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    jest.mocked(posts.createForOccurrence).mockResolvedValue({
      type: 'CREATED',
      post: {
        id: 31,
        jogakExecutionId: 19,
        authorId: 7,
        jogakId: 11,
        scheduledDate: '2026-07-23',
        contents: '오늘 회고',
        createdAt: new Date('2026-07-23T12:00:00.000Z'),
      },
    });
    const service = new PostsService(posts, occurrences, storage(), mogaks());

    await expect(
      service.createPost(7, {
        jogakId: 11,
        targetDate: '2026-07-23',
        contents: '  오늘 회고  ',
      }),
    ).resolves.toMatchObject({
      id: 31,
      mogakId: 3,
      jogakId: 11,
      targetDate: '2026-07-23',
      userId: 7,
      contents: '오늘 회고',
      imgUrls: [],
    });
    expect(posts.createForOccurrence).toHaveBeenCalledWith({
      authorId: 7,
      jogakId: 11,
      scheduledDate: '2026-07-23',
      jogakTitleSnapshot: '문제 풀이',
      contents: '오늘 회고',
    });
  });

  it('같은 실행의 중복 게시글을 거짓 성공 없이 거부한다', async () => {
    const posts = repository();
    const occurrences = jogaks();
    jest.mocked(occurrences.resolveOwnedOccurrence).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    jest.mocked(posts.createForOccurrence).mockResolvedValue({ type: 'DUPLICATE' });
    const service = new PostsService(posts, occurrences, storage(), mogaks());

    await expect(
      service.createPost(7, {
        jogakId: 11,
        targetDate: '2026-07-23',
        contents: '오늘 회고',
      }),
    ).rejects.toEqual(new DomainException(AppErrorCode.POST_ALREADY_EXISTS));
  });

  it('발생을 해석하기 전에 비어 있거나 너무 긴 게시글 내용을 거부한다', async () => {
    const posts = repository();
    const occurrences = jogaks();
    const service = new PostsService(posts, occurrences, storage(), mogaks());

    await expect(
      service.createPost(7, { jogakId: 11, targetDate: '2026-07-23', contents: '   ' }),
    ).rejects.toEqual(new DomainException(AppErrorCode.INVALID_PARAMETER));
    await expect(
      service.createPost(7, {
        jogakId: 11,
        targetDate: '2026-07-23',
        contents: 'x'.repeat(351),
      }),
    ).rejects.toEqual(new DomainException(AppErrorCode.POST_CONTENTS_TOO_LONG));
    expect(occurrences.resolveOwnedOccurrence).not.toHaveBeenCalled();
    expect(posts.createForOccurrence).not.toHaveBeenCalled();
  });

  it('저장된 게시글 카운터 없이 원본 행으로 좋아요를 전환한다', async () => {
    const posts = repository();
    jest.mocked(posts.findPost).mockResolvedValue({ id: 31 });
    jest.mocked(posts.toggleLike).mockResolvedValue('CREATED');
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.toggleLike(7, 31)).resolves.toEqual('좋아요가 생성되었습니다');
    expect(posts.toggleLike).toHaveBeenCalledWith({ postId: 31, userId: 7 });
  });

  it('승인된 중첩 작성자와 해석한 프로필 URL로 댓글을 반환한다', async () => {
    const posts = repository();
    const urls = storage();
    jest.mocked(posts.findPost).mockResolvedValue({ id: 31 });
    jest.mocked(posts.listComments).mockResolvedValue([
      {
        id: 41,
        postId: 31,
        authorId: 8,
        authorNickname: '모각러',
        authorJob: '개발/데이터',
        authorProfileImageKey: 'profiles/8.png',
        contents: '좋은 회고네요',
        createdAt: new Date('2026-07-23T12:00:00.000Z'),
        updatedAt: new Date('2026-07-23T12:00:00.000Z'),
      },
    ]);
    jest.mocked(urls.resolvePublicUrl).mockResolvedValue('https://cdn.example/profiles/8.png');
    const service = new PostsService(posts, jogaks(), urls, mogaks());

    await expect(service.listComments(31)).resolves.toEqual({
      comments: [
        {
          commentId: 41,
          postId: 31,
          contents: '좋은 회고네요',
          createdAt: new Date('2026-07-23T12:00:00.000Z'),
          author: {
            userId: 8,
            nickname: '모각러',
            profileImageUrl: 'https://cdn.example/profiles/8.png',
            job: '개발/데이터',
          },
        },
      ],
    });
  });

  it('저장된 게시글 수를 수정하지 않고 댓글을 생성한다', async () => {
    const posts = repository();
    const urls = storage();
    jest.mocked(posts.findPost).mockResolvedValue({ id: 31 });
    jest.mocked(posts.createComment).mockResolvedValue({
      id: 41,
      postId: 31,
      authorId: 7,
      authorNickname: '작성자',
      authorJob: '개발/데이터',
      authorProfileImageKey: null,
      contents: '좋은 회고네요',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      updatedAt: new Date('2026-07-23T12:00:00.000Z'),
    });
    const service = new PostsService(posts, jogaks(), urls, mogaks());

    await expect(service.createComment(7, 31, '  좋은 회고네요  ')).resolves.toMatchObject({
      id: 41,
      postId: 31,
      userId: 7,
      contents: '좋은 회고네요',
      author: { userId: 7, nickname: '작성자', profileImageUrl: null, job: '개발/데이터' },
    });
    expect(posts.createComment).toHaveBeenCalledWith({
      postId: 31,
      authorId: 7,
      contents: '좋은 회고네요',
    });
  });

  it('저장 전에 작성자가 아닌 사용자의 댓글 수정을 거부한다', async () => {
    const posts = repository();
    jest.mocked(posts.findComment).mockResolvedValue({
      id: 41,
      postId: 31,
      authorId: 8,
      authorNickname: '다른 사용자',
      authorJob: null,
      authorProfileImageKey: null,
      contents: '원래 댓글',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      updatedAt: new Date('2026-07-23T12:00:00.000Z'),
    });
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.updateComment(7, 31, 41, '수정 시도')).rejects.toEqual(
      new DomainException(AppErrorCode.FORBIDDEN),
    );
    expect(posts.updateComment).not.toHaveBeenCalled();
  });

  it('댓글 수정 식별자와 수정 시각을 유지하며 중첩 작성자도 반환한다', async () => {
    const posts = repository();
    const urls = storage();
    jest.mocked(posts.findComment).mockResolvedValue({
      id: 41,
      postId: 31,
      authorId: 7,
      authorNickname: '작성자',
      authorJob: '개발/데이터',
      authorProfileImageKey: null,
      contents: '원래 댓글',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      updatedAt: new Date('2026-07-23T12:00:00.000Z'),
    });
    jest.mocked(posts.updateComment).mockResolvedValue({
      id: 41,
      postId: 31,
      authorId: 7,
      authorNickname: '작성자',
      authorJob: '개발/데이터',
      authorProfileImageKey: null,
      contents: '수정된 댓글',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      updatedAt: new Date('2026-07-23T13:00:00.000Z'),
    });
    const service = new PostsService(posts, jogaks(), urls, mogaks());

    await expect(service.updateComment(7, 31, 41, '수정된 댓글')).resolves.toMatchObject({
      id: 41,
      contents: '수정된 댓글',
      updatedAt: new Date('2026-07-23T13:00:00.000Z'),
      author: { userId: 7, nickname: '작성자' },
    });
  });

  it('작성자 조건을 통해서만 게시글을 수정한다', async () => {
    const posts = repository();
    jest.mocked(posts.updateOwnedPost).mockResolvedValue({
      id: 31,
      contents: '수정된 회고',
      updatedAt: new Date('2026-07-23T13:00:00.000Z'),
    });
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.updatePost(7, 31, '  수정된 회고  ')).resolves.toEqual({
      postId: 31,
      contents: '수정된 회고',
      updatedAt: new Date('2026-07-23T13:00:00.000Z'),
    });
    expect(posts.updateOwnedPost).toHaveBeenCalledWith({
      postId: 31,
      authorId: 7,
      contents: '수정된 회고',
      now: expect.any(Date),
    });
  });

  it('외래키 cascade가 자식을 처리하도록 작성자 조건으로 게시글 행만 삭제한다', async () => {
    const posts = repository();
    jest.mocked(posts.deleteOwnedPost).mockResolvedValue(true);
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.deletePost(7, 31)).resolves.toBeUndefined();
    expect(posts.deleteOwnedPost).toHaveBeenCalledWith({ postId: 31, authorId: 7 });
  });

  it('일간 조각 식별자나 저장된 수를 노출하지 않고 가상 발생으로 게시글을 조회한다', async () => {
    const posts = repository();
    const occurrences = jogaks();
    jest.mocked(occurrences.resolveOwnedOccurrence).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    jest.mocked(posts.findOwnedPostByOccurrence).mockResolvedValue({
      id: 31,
      authorId: 7,
      jogakId: 11,
      mogakId: 3,
      scheduledDate: '2026-07-23',
      contents: '오늘 회고',
      likeCount: 4,
      commentCount: 2,
    });
    jest.mocked(posts.listImagesForPosts).mockResolvedValue([]);
    jest.mocked(posts.listCommentIds).mockResolvedValue([41, 42]);
    const service = new PostsService(posts, occurrences, storage(), mogaks());

    await expect(service.getPostByJogakAndDate(7, 11, '2026-07-23')).resolves.toEqual({
      postId: 31,
      mogakId: 3,
      jogakId: 11,
      targetDate: '2026-07-23',
      userId: 7,
      contents: '오늘 회고',
      imgUrls: [],
      commentId: [41, 42],
      likeCnt: 4,
      commentCnt: 2,
    });
  });

  it('작성자 조건이 맞을 때만 게시글 상세를 조회한다', async () => {
    const posts = repository();
    jest.mocked(posts.findOwnedPost).mockResolvedValue({
      id: 31,
      authorId: 7,
      jogakId: 11,
      mogakId: 3,
      scheduledDate: '2026-07-23',
      contents: '오늘 회고',
      likeCount: 0,
      commentCount: 0,
    });
    jest.mocked(posts.listImagesForPosts).mockResolvedValue([]);
    jest.mocked(posts.listCommentIds).mockResolvedValue([]);
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.getPost(7, 31)).resolves.toMatchObject({
      postId: 31,
      userId: 7,
      likeCnt: 0,
      commentCnt: 0,
    });
  });

  it('하나의 제한된 projection과 이미지 메타데이터 조회로 모각 게시글 일부를 반환한다', async () => {
    const posts = repository();
    const ownedMogaks = mogaks();
    const urls = storage();
    jest.mocked(ownedMogaks.resolveOwnedMogak).mockResolvedValue({ id: 3 });
    jest.mocked(posts.listOwnedMogakPosts).mockResolvedValue([
      {
        id: 31,
        authorId: 7,
        jogakId: 11,
        mogakId: 3,
        scheduledDate: '2026-07-23',
        contents: '오늘 회고',
        likeCount: 4,
        commentCount: 2,
      },
    ]);
    jest
      .mocked(posts.listImagesForPosts)
      .mockResolvedValue([{ postId: 31, storageKey: 'posts/31-0.png', position: 0 }]);
    jest.mocked(urls.resolvePublicUrl).mockResolvedValue('https://cdn.example/posts/31-0.png');
    const service = new PostsService(posts, jogaks(), urls, ownedMogaks);

    await expect(service.listMogakPosts(7, 3, 0, 10)).resolves.toEqual({
      content: [
        {
          postId: 31,
          mogakId: 3,
          jogakId: 11,
          targetDate: '2026-07-23',
          contents: '오늘 회고',
          thumbnailUrl: 'https://cdn.example/posts/31-0.png',
          likeCnt: 4,
        },
      ],
      size: 10,
      number: 0,
      numberOfElements: 1,
      first: true,
      last: true,
      empty: false,
    });
    expect(posts.listOwnedMogakPosts).toHaveBeenCalledWith({
      userId: 7,
      mogakId: 3,
      limit: 11,
      offset: 0,
    });
  });
});
