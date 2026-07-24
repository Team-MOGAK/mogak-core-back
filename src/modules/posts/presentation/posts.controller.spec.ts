import { jest } from '@jest/globals';
import { testMock } from '../../../../test/test-mock';
import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../../../app.setup';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { PostsService } from '../application/posts.service';
import { PostsController } from './posts.controller';

describe('게시글 HTTP 계약', () => {
  let app: INestApplication;
  const posts = {
    createPost: testMock(),
    listMogakPosts: testMock(),
    getPostByJogakAndDate: testMock(),
    getPost: testMock(),
    updatePost: testMock(),
    deletePost: testMock(),
    createComment: testMock(),
    listComments: testMock(),
    updateComment: testMock(),
    deleteComment: testMock(),
    toggleLike: testMock(),
  };
  const storage = { uploadPostImages: testMock() } as unknown as StoragePort;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        { provide: PostsService, useValue: posts },
        { provide: STORAGE_PORT, useValue: storage },
        RegisteredUserGuard,
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

  it('일간 조각 식별자는 제외하고 게시글 생성 경로와 targetDate를 유지한다', async () => {
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

  it('게시글 JSON과 multipart request의 잘못된 입력을 Z005로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .send({ targetDate: '2026-07-23', contents: '회고', unexpected: true })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', '{')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));

    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('필수 size만 주어지면 모각 피드 페이지를 0으로 기본 설정한다', async () => {
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

  it('유지된 조각과 targetDate 경로로 게시글을 조회한다', async () => {
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

  it('비어 있는 multipart 이미지 필드는 받고 실제 이미지는 저장소 경계에서 거부한다', async () => {
    posts.createPost.mockResolvedValue({ id: 31 });

    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.alloc(0), 'empty.png')
      .expect(200);
    expect(storage.uploadPostImages).not.toHaveBeenCalled();

    jest
      .mocked(storage.uploadPostImages)
      .mockRejectedValue(new AppException(AppErrorCode.STORAGE_DISABLED));
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.from('image'), 'post.png')
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe('Z006'));
    expect(posts.createPost).toHaveBeenCalledTimes(1);
  });

  it('게시글은 다섯 장을 초과하거나 5 MiB를 넘는 이미지를 서비스에 전달하지 않는다', async () => {
    const image = Buffer.from('image');
    let tooManyFiles = request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }));
    for (let index = 0; index < 6; index += 1) {
      tooManyFiles = tooManyFiles.attach('multipartFile', image, {
        filename: `post-${index}.png`,
        contentType: 'image/png',
      });
    }

    await tooManyFiles.expect(400);
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(storage.uploadPostImages).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('게시글은 이미지가 아닌 multipart 파일을 서비스에 전달하지 않는다', async () => {
    await request(app.getHttpServer())
      .post('/api/jogaks/11/posts')
      .field('request', JSON.stringify({ targetDate: '2026-07-23', contents: '오늘 회고' }))
      .attach('multipartFile', Buffer.from('not an image'), {
        filename: 'payload.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(storage.uploadPostImages).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('승인된 중첩 댓글 작성자를 유지하며 댓글과 좋아요 경로를 유지한다', async () => {
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

  it('기존 API 보안 정책과 같은 액세스 토큰 가드를 댓글 목록에 적용한다', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PostsController.prototype.listComments)).toContain(
      AccessTokenGuard,
    );
  });

  it('기존 경로에서 게시글 조회와 수정과 삭제 응답을 유지한다', async () => {
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

  it('댓글 생성과 수정과 삭제 계약을 목록 항목 형태와 분리해 유지한다', async () => {
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
