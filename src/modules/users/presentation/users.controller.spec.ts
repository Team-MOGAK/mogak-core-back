import { jest } from '@jest/globals';
import { testMock } from '../../../../test/test-mock';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../../../app.setup';
import { FixedWindowRateLimiter } from '../../../common/http/fixed-window-rate-limiter';
import { RateLimitGuard } from '../../../common/http/rate-limit.guard';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { RegisteredUserGuard } from '../../auth/presentation/registered-user.guard';
import { ConsentService } from '../application/consent.service';
import { MetadataService } from '../application/metadata.service';
import { UserService } from '../application/user.service';
import { ConsentController } from './consent.controller';
import { MetadataController } from './metadata.controller';
import { UserController } from './user.controller';

describe('사용자 HTTP 계약', () => {
  let app: INestApplication;
  let role: 'PENDING' | 'USER';
  const users = {
    verifyNickname: testMock(),
    join: testMock(),
    profile: testMock(),
    updateNickname: testMock(),
    updateJob: testMock(),
    updateProfileImage: testMock(),
  };
  const consents = {
    listActive: testMock(),
    update: testMock(),
    getMarketing: testMock(),
    updateMarketing: testMock(),
  };
  const metadata = { jobs: testMock(), addresses: testMock() };

  beforeEach(async () => {
    jest.resetAllMocks();
    role = 'USER';
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController, ConsentController, MetadataController],
      providers: [
        { provide: UserService, useValue: users },
        { provide: ConsentService, useValue: consents },
        { provide: MetadataService, useValue: metadata },
        FixedWindowRateLimiter,
        RateLimitGuard,
        RegisteredUserGuard,
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) => {
          context.switchToHttp().getRequest().user = {
            userId: 7,
            role,
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

  it('닉네임 검증을 유지하고 이메일 전용 로그인 경로를 제거한다', async () => {
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

  it('공백뿐인 닉네임 검증 요청을 잘못된 요청으로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/users/nickname/verify')
      .send({ nickname: '  ' })
      .expect(400);
    expect(users.verifyNickname).not.toHaveBeenCalled();
  });

  it('같은 IP의 닉네임 검증 요청은 분당 서른 번째까지만 서비스에 전달한다', async () => {
    users.verifyNickname.mockResolvedValue(undefined);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/users/nickname/verify')
        .send({ nickname: '모각러' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/api/users/nickname/verify')
      .send({ nickname: '모각러' })
      .expect(429)
      .expect(({ body }) => expect(body.code).toBe('Z007'));

    expect(users.verifyNickname).toHaveBeenCalledTimes(30);
  });

  it('가입 전 사용자는 프로필을 조회할 수 없고 가입 완료 사용자는 기존 프로필 계약을 유지한다', async () => {
    users.profile.mockResolvedValue({ nickname: '모각러', job: '개발/데이터', imgUrl: null });
    metadata.jobs.mockResolvedValue([{ id: 1, name: '개발/데이터' }]);

    role = 'PENDING';
    await request(app.getHttpServer()).get('/api/users/profile').expect(403);

    role = 'USER';
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

  it('비어 있는 마케팅 수정 요청을 잘못된 파라미터로 거부한다', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/marketing-consent')
      .send({})
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));
  });

  it('프로필 이미지는 이미지가 아니거나 5 MiB를 넘으면 서비스에 전달하지 않는다', async () => {
    await request(app.getHttpServer())
      .put('/api/users/profile/image')
      .attach('multipartFile', Buffer.from('not an image'), {
        filename: 'profile.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/users/profile/image')
      .attach('multipartFile', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(users.updateProfileImage).not.toHaveBeenCalled();
  });
});
