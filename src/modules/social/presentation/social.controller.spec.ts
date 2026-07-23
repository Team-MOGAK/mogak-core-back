import { jest } from '@jest/globals';
import { testMock } from '../../../../test/test-mock';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../../../app.setup';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { SocialService } from '../application/social.service';
import { SocialController } from './social.controller';

describe('소셜 HTTP 계약', () => {
  let app: INestApplication;
  const social = {
    follow: testMock(),
    unfollow: testMock(),
    getFollowCounts: testMock(),
    listMotos: testMock(),
    listMentors: testMock(),
    listPacemakerPosts: testMock(),
    listNetworkPosts: testMock(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [{ provide: SocialService, useValue: social }, RegisteredUserGuard],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) => {
          context.switchToHttp().getRequest().user = {
            userId: 7,
            role: 'USER',
            sessionId: 'session',
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

  it('실제 SUCCESS 결과와 닉네임 팔로우와 언팔로우 경로를 유지한다', async () => {
    await request(app.getHttpServer())
      .post('/api/users/follows/모각러')
      .expect(200)
      .expect(({ body }) => expect(body.result).toBe('SUCCESS'));
    await request(app.getHttpServer())
      .delete('/api/users/follows/모각러')
      .expect(200)
      .expect(({ body }) => expect(body.result).toBe('SUCCESS'));
    expect(social.follow).toHaveBeenCalledWith(7, '모각러');
    expect(social.unfollow).toHaveBeenCalledWith(7, '모각러');
  });

  it('네트워크 기본값과 승인된 중첩 작성자 응답을 유지한다', async () => {
    social.listNetworkPosts.mockResolvedValue({
      content: [{ postId: 31, author: { userId: 8, nickname: '모각러' } }],
    });
    await request(app.getHttpServer())
      .get('/api/posts?size=10')
      .expect(200)
      .expect(({ body }) => expect(body.result.content[0].author.nickname).toBe('모각러'));
    expect(social.listNetworkPosts).toHaveBeenCalledWith(7, 0, 10, 'createdAt', undefined);
  });

  it('페이스메이커 cursor 파라미터를 유지하고 제거한 게시글별 좋아요 경로를 거부한다', async () => {
    social.listPacemakerPosts.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/api/posts/pacemakers?cursor=0&size=10').expect(200);
    await request(app.getHttpServer()).post('/api/posts/31/like').expect(404);
    expect(social.listPacemakerPosts).toHaveBeenCalledWith(7, 0, 10);
  });
});
