import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { MogaksService } from '../../mogaks/application/mogaks.service';
import type { JogaksService } from '../../mogaks/application/jogaks.service';
import type { StoragePort } from '../../storage/application/storage.port';
import type { PostsRepository } from '../infrastructure/posts.repository';
import { PostsService } from './posts.service';

function repository(): PostsRepository {
  return {
    createForOccurrence: vi.fn(),
    findPost: vi.fn(),
    toggleLike: vi.fn(),
    listComments: vi.fn(),
    createComment: vi.fn(),
    findComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    updateOwnedPost: vi.fn(),
    deleteOwnedPost: vi.fn(),
    findOwnedPostByOccurrence: vi.fn(),
    findOwnedPost: vi.fn(),
    listImagesForPosts: vi.fn(),
    listCommentIds: vi.fn(),
    listOwnedMogakPosts: vi.fn(),
  } as unknown as PostsRepository;
}

function jogaks(): JogaksService {
  return {
    resolveOwnedOccurrence: vi.fn(),
  } as unknown as JogaksService;
}

function storage(): StoragePort {
  return {
    resolvePublicUrl: vi.fn(),
  } as unknown as StoragePort;
}

function mogaks(): MogaksService {
  return {
    resolveOwnedMogak: vi.fn(),
  } as unknown as MogaksService;
}

describe('PostsService', () => {
  it('creates one post for an owned virtual occurrence and captures the current Jogak title', async () => {
    const posts = repository();
    const occurrences = jogaks();
    vi.mocked(occurrences.resolveOwnedOccurrence).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    vi.mocked(posts.createForOccurrence).mockResolvedValue({
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

  it('rejects a duplicate post for the same execution without reporting a false success', async () => {
    const posts = repository();
    const occurrences = jogaks();
    vi.mocked(occurrences.resolveOwnedOccurrence).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    vi.mocked(posts.createForOccurrence).mockResolvedValue({ type: 'DUPLICATE' });
    const service = new PostsService(posts, occurrences, storage(), mogaks());

    await expect(
      service.createPost(7, {
        jogakId: 11,
        targetDate: '2026-07-23',
        contents: '오늘 회고',
      }),
    ).rejects.toEqual(new AppException(AppErrorCode.POST_ALREADY_EXISTS));
  });

  it('rejects blank and overlong post contents before resolving an occurrence', async () => {
    const posts = repository();
    const occurrences = jogaks();
    const service = new PostsService(posts, occurrences, storage(), mogaks());

    await expect(
      service.createPost(7, { jogakId: 11, targetDate: '2026-07-23', contents: '   ' }),
    ).rejects.toEqual(new AppException(AppErrorCode.INVALID_PARAMETER));
    await expect(
      service.createPost(7, {
        jogakId: 11,
        targetDate: '2026-07-23',
        contents: 'x'.repeat(351),
      }),
    ).rejects.toEqual(new AppException(AppErrorCode.POST_CONTENTS_TOO_LONG));
    expect(occurrences.resolveOwnedOccurrence).not.toHaveBeenCalled();
    expect(posts.createForOccurrence).not.toHaveBeenCalled();
  });

  it('toggles a like through its source row without a stored post counter', async () => {
    const posts = repository();
    vi.mocked(posts.findPost).mockResolvedValue({ id: 31 });
    vi.mocked(posts.toggleLike).mockResolvedValue('CREATED');
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.toggleLike(7, 31)).resolves.toEqual('좋아요가 생성되었습니다');
    expect(posts.toggleLike).toHaveBeenCalledWith({ postId: 31, userId: 7 });
  });

  it('returns comments with the approved nested author and a resolved profile URL', async () => {
    const posts = repository();
    const urls = storage();
    vi.mocked(posts.findPost).mockResolvedValue({ id: 31 });
    vi.mocked(posts.listComments).mockResolvedValue([
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
    vi.mocked(urls.resolvePublicUrl).mockResolvedValue('https://cdn.example/profiles/8.png');
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

  it('creates a comment without updating a stored post count', async () => {
    const posts = repository();
    const urls = storage();
    vi.mocked(posts.findPost).mockResolvedValue({ id: 31 });
    vi.mocked(posts.createComment).mockResolvedValue({
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

  it('rejects a comment update from someone other than its author before writing', async () => {
    const posts = repository();
    vi.mocked(posts.findComment).mockResolvedValue({
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
      new AppException(AppErrorCode.FORBIDDEN),
    );
    expect(posts.updateComment).not.toHaveBeenCalled();
  });

  it('keeps a comment update id and updatedAt while also returning its nested author', async () => {
    const posts = repository();
    const urls = storage();
    vi.mocked(posts.findComment).mockResolvedValue({
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
    vi.mocked(posts.updateComment).mockResolvedValue({
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

  it('updates a post only through its author predicate', async () => {
    const posts = repository();
    vi.mocked(posts.updateOwnedPost).mockResolvedValue({
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

  it('deletes only the post row through its author predicate so FK cascades own its children', async () => {
    const posts = repository();
    vi.mocked(posts.deleteOwnedPost).mockResolvedValue(true);
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.deletePost(7, 31)).resolves.toBeUndefined();
    expect(posts.deleteOwnedPost).toHaveBeenCalledWith({ postId: 31, authorId: 7 });
  });

  it('reads a post by virtual occurrence without exposing a DailyJogak id or stored counts', async () => {
    const posts = repository();
    const occurrences = jogaks();
    vi.mocked(occurrences.resolveOwnedOccurrence).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    vi.mocked(posts.findOwnedPostByOccurrence).mockResolvedValue({
      id: 31,
      authorId: 7,
      jogakId: 11,
      mogakId: 3,
      scheduledDate: '2026-07-23',
      contents: '오늘 회고',
      likeCount: 4,
      commentCount: 2,
    });
    vi.mocked(posts.listImagesForPosts).mockResolvedValue([]);
    vi.mocked(posts.listCommentIds).mockResolvedValue([41, 42]);
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

  it('reads a post detail only when its author predicate matches', async () => {
    const posts = repository();
    vi.mocked(posts.findOwnedPost).mockResolvedValue({
      id: 31,
      authorId: 7,
      jogakId: 11,
      mogakId: 3,
      scheduledDate: '2026-07-23',
      contents: '오늘 회고',
      likeCount: 0,
      commentCount: 0,
    });
    vi.mocked(posts.listImagesForPosts).mockResolvedValue([]);
    vi.mocked(posts.listCommentIds).mockResolvedValue([]);
    const service = new PostsService(posts, jogaks(), storage(), mogaks());

    await expect(service.getPost(7, 31)).resolves.toMatchObject({
      postId: 31,
      userId: 7,
      likeCnt: 0,
      commentCnt: 0,
    });
  });

  it('returns a Mogak post slice from one bounded projection plus image metadata lookup', async () => {
    const posts = repository();
    const ownedMogaks = mogaks();
    const urls = storage();
    vi.mocked(ownedMogaks.resolveOwnedMogak).mockResolvedValue({ id: 3 });
    vi.mocked(posts.listOwnedMogakPosts).mockResolvedValue([
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
    vi.mocked(posts.listImagesForPosts).mockResolvedValue([
      { postId: 31, storageKey: 'posts/31-0.png', position: 0 },
    ]);
    vi.mocked(urls.resolvePublicUrl).mockResolvedValue('https://cdn.example/posts/31-0.png');
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
