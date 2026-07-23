import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../../../app.setup';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { SocialService } from '../application/social.service';
import { SocialController } from './social.controller';

describe('Social HTTP contract', () => {
  let app: INestApplication;
  const social = {
    follow: vi.fn(),
    unfollow: vi.fn(),
    getFollowCounts: vi.fn(),
    listMotos: vi.fn(),
    listMentors: vi.fn(),
    listPacemakerPosts: vi.fn(),
    listNetworkPosts: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [{ provide: SocialService, useValue: social }],
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

  it('keeps nickname follow and unfollow paths with the actual SUCCESS result', async () => {
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

  it('keeps network defaults and approved nested author response', async () => {
    social.listNetworkPosts.mockResolvedValue({
      content: [{ postId: 31, author: { userId: 8, nickname: '모각러' } }],
    });
    await request(app.getHttpServer())
      .get('/api/posts?size=10')
      .expect(200)
      .expect(({ body }) => expect(body.result.content[0].author.nickname).toBe('모각러'));
    expect(social.listNetworkPosts).toHaveBeenCalledWith(7, 0, 10, 'createdAt', undefined);
  });

  it('keeps the Pacemaker cursor parameter and rejects the removed per-post like path', async () => {
    social.listPacemakerPosts.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/api/posts/pacemakers?cursor=0&size=10').expect(200);
    await request(app.getHttpServer()).post('/api/posts/31/like').expect(404);
    expect(social.listPacemakerPosts).toHaveBeenCalledWith(7, 0, 10);
  });
});
