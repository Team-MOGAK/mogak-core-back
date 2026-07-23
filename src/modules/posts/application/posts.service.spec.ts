import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { JogaksService } from '../../mogaks/application/jogaks.service';
import type { PostsRepository } from '../infrastructure/posts.repository';
import { PostsService } from './posts.service';

function repository(): PostsRepository {
  return {
    createForOccurrence: vi.fn(),
  } as unknown as PostsRepository;
}

function jogaks(): JogaksService {
  return {
    resolveOwnedOccurrence: vi.fn(),
  } as unknown as JogaksService;
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
    const service = new PostsService(posts, occurrences);

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
    const service = new PostsService(posts, occurrences);

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
    const service = new PostsService(posts, occurrences);

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
});
