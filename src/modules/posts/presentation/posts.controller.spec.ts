import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../../../app.setup';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { PostsService } from '../application/posts.service';
import { PostsController } from './posts.controller';

describe('Posts HTTP contract', () => {
  let app: INestApplication;
  const posts = {
    createPost: vi.fn(),
    listMogakPosts: vi.fn(),
    getPostByJogakAndDate: vi.fn(),
    getPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    createComment: vi.fn(),
    listComments: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    toggleLike: vi.fn(),
  };
  const storage = { uploadPostImages: vi.fn() } as unknown as StoragePort;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        { provide: PostsService, useValue: posts },
        { provide: STORAGE_PORT, useValue: storage },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) => {
          context.switchToHttp().getRequest().user = {
            userId: 7,
            role: 'USER',
            sessionId: 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('keeps the post creation path and targetDate while omitting DailyJogak IDs', async () => {
    posts.createPost.mockResolvedValue({
      id: 31,
      mogakId: 3,
      jogakId: 11,
      targetDate: '2026-07-23',
      userId: 7,
      contents: '오늘 회고',
      imgUrls: [],
    });

    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .send({ targetDate: '2026-07-23', contents: '오늘 회고' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.result).toMatchObject({ jogakId: 11, targetDate: '2026-07-23' });
        expect(body.result.dailyJogakId).toBeUndefined();
      });
    expect(posts.createPost).toHaveBeenCalledWith(7, {
      jogakId: 11,
      targetDate: '2026-07-23',
      contents: '오늘 회고',
    });
  });

  it('defaults the Mogak feed page to zero when only its required size is supplied', async () => {
    posts.listMogakPosts.mockResolvedValue({
      content: [],
      size: 10,
      number: 0,
      numberOfElements: 0,
      first: true,
      last: true,
      empty: true,
    });

    await request(app.getHttpServer()).get('/api/mogaks/3/posts?size=10').expect(200);

    expect(posts.listMogakPosts).toHaveBeenCalledWith(7, 3, 0, 10);
  });

  it('reads a post through the retained Jogak and targetDate path', async () => {
    posts.getPostByJogakAndDate.mockResolvedValue({
      postId: 31,
      jogakId: 11,
      targetDate: '2026-07-23',
    });

    await request(app.getHttpServer())
      .get('/api/jogaks/11/posts?targetDate=2026-07-23')
      .expect(200)
      .expect(({ body }) => expect(body.result).toMatchObject({ postId: 31, jogakId: 11 }));

    expect(posts.getPostByJogakAndDate).toHaveBeenCalledWith(7, 11, '2026-07-23');
  });

  it('accepts an empty multipart image field but rejects a real image through the Storage boundary', async () => {
    posts.createPost.mockResolvedValue({ id: 31 });

    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.alloc(0), 'empty.png')
      .expect(200);
    expect(storage.uploadPostImages).not.toHaveBeenCalled();

    vi.mocked(storage.uploadPostImages).mockRejectedValue(
      new AppException(AppErrorCode.STORAGE_DISABLED),
    );
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.from('image'), 'post.png')
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe('Z006'));
    expect(posts.createPost).toHaveBeenCalledTimes(1);
  });

  it('keeps comment and like paths while retaining the approved nested comment author', async () => {
    posts.listComments.mockResolvedValue({
      comments: [
        {
          commentId: 41,
          postId: 31,
          contents: '좋은 회고네요',
          author: { userId: 8, nickname: '모각러', profileImageUrl: null, job: '개발/데이터' },
        },
      ],
    });
    posts.toggleLike.mockResolvedValue('좋아요가 생성되었습니다');

    await request(app.getHttpServer())
      .get('/api/posts/31/comments')
      .expect(200)
      .expect(({ body }) => expect(body.result.comments[0].author.nickname).toBe('모각러'));
    await request(app.getHttpServer())
      .post('/api/posts/like')
      .send({ postId: 31 })
      .expect(200)
      .expect(({ body }) => expect(body.result).toBe('좋아요가 생성되었습니다'));
    await request(app.getHttpServer()).post('/api/posts/31/like').expect(404);
    expect(posts.toggleLike).toHaveBeenCalledWith(7, 31);
  });

  it('requires the same access-token guard for comment listing as the legacy API security policy', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PostsController.prototype.listComments)).toContain(
      AccessTokenGuard,
    );
  });

  it('keeps post read, update, and delete responses on their legacy paths', async () => {
    posts.getPost.mockResolvedValue({ postId: 31, contents: '오늘 회고' });
    posts.updatePost.mockResolvedValue({
      postId: 31,
      contents: '수정된 회고',
      updatedAt: '2026-07-23T13:00:00.000Z',
    });

    await request(app.getHttpServer())
      .get('/api/posts/31')
      .expect(200)
      .expect(({ body }) => expect(body.result.postId).toBe(31));
    await request(app.getHttpServer())
      .put('/api/posts/31')
      .send({ contents: '수정된 회고' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.result).toMatchObject({ id: 31, contents: '수정된 회고' });
        expect(body.result.postId).toBeUndefined();
      });
    await request(app.getHttpServer())
      .delete('/api/posts/31')
      .expect(200)
      .expect(({ body }) => expect(body.result).toEqual({ deleted: true }));
    expect(posts.getPost).toHaveBeenCalledWith(7, 31);
    expect(posts.updatePost).toHaveBeenCalledWith(7, 31, '수정된 회고');
    expect(posts.deletePost).toHaveBeenCalledWith(7, 31);
  });

  it('keeps comment creation, update, and deletion contracts separate from the list item shape', async () => {
    const author = { userId: 7, nickname: '작성자', profileImageUrl: null, job: '개발/데이터' };
    posts.createComment.mockResolvedValue({
      id: 41,
      postId: 31,
      userId: 7,
      contents: '새 댓글',
      createdAt: '2026-07-23T12:00:00.000Z',
      author,
    });
    posts.updateComment.mockResolvedValue({
      id: 41,
      contents: '수정된 댓글',
      updatedAt: '2026-07-23T13:00:00.000Z',
      author,
    });

    await request(app.getHttpServer())
      .post('/api/posts/31/comments')
      .send({ contents: '새 댓글' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.result).toMatchObject({ id: 41, postId: 31, userId: 7, author });
        expect(body.result.commentId).toBeUndefined();
      });
    await request(app.getHttpServer())
      .put('/api/posts/31/comments/41')
      .send({ contents: '수정된 댓글' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.result).toMatchObject({ id: 41, contents: '수정된 댓글', author }),
      );
    await request(app.getHttpServer())
      .delete('/api/posts/31/comments/41')
      .expect(200)
      .expect(({ body }) => expect(body.result).toEqual({ deleted: true }));
    expect(posts.createComment).toHaveBeenCalledWith(7, 31, '새 댓글');
    expect(posts.updateComment).toHaveBeenCalledWith(7, 31, 41, '수정된 댓글');
    expect(posts.deleteComment).toHaveBeenCalledWith(7, 31, 41);
  });
});
