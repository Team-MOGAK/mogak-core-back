import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../../../app.setup';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { ConsentService } from '../application/consent.service';
import { MetadataService } from '../application/metadata.service';
import { UserService } from '../application/user.service';
import { ConsentController } from './consent.controller';
import { MetadataController } from './metadata.controller';
import { UserController } from './user.controller';

describe('users HTTP contract', () => {
  let app: INestApplication;
  const users = {
    verifyNickname: vi.fn(),
    join: vi.fn(),
    profile: vi.fn(),
    updateNickname: vi.fn(),
    updateJob: vi.fn(),
  };
  const consents = {
    listActive: vi.fn(),
    update: vi.fn(),
    getMarketing: vi.fn(),
    updateMarketing: vi.fn(),
  };
  const metadata = { jobs: vi.fn(), addresses: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController, ConsentController, MetadataController],
      providers: [
        { provide: UserService, useValue: users },
        { provide: ConsentService, useValue: consents },
        { provide: MetadataService, useValue: metadata },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) => {
          context.switchToHttp().getRequest().user = {
            userId: 7,
            role: 'PENDING',
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

  it('keeps nickname verification and removes the email-only login path', async () => {
    await request(app.getHttpServer())
      .post('/api/users/nickname/verify')
      .send({ nickname: '모각러' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'OK', code: 'success' }));
    expect(users.verifyNickname).toHaveBeenCalledWith('모각러');

    await request(app.getHttpServer())
      .post('/api/users/login')
      .send({ email: 'unsafe@example.test' })
      .expect(404);
  });

  it('preserves the profile imgUrl response key and metadata name contract', async () => {
    users.profile.mockResolvedValue({ nickname: '모각러', job: '개발/데이터', imgUrl: null });
    metadata.jobs.mockResolvedValue([{ id: 1, name: '개발/데이터' }]);

    await request(app.getHttpServer())
      .get('/api/users/profile')
      .expect(200)
      .expect(({ body }) =>
        expect(body.result).toEqual({ nickname: '모각러', job: '개발/데이터', imgUrl: null }),
      );
    await request(app.getHttpServer())
      .get('/api/metadata/jobs')
      .expect(200)
      .expect(({ body }) => expect(body.result).toEqual([{ name: '개발/데이터' }]));
  });

  it('rejects an empty marketing patch as an invalid parameter', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/marketing-consent')
      .send({})
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));
  });
});
