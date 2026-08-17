import { jest } from '@jest/globals';
import { testMock } from '../../testMock';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

import { BoundedThrottlerStorage } from '@api/common/http/boundedThrottler.storage';
import { configureApp } from '@api/app.setup';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { ConsentService } from '@core/users/application/service/consent.service';
import { MetadataService } from '@core/users/application/service/metadata.service';
import { UserService } from '@core/users/application/service/user.service';
import { ConsentController } from '@api/users/presentation/controller/consent.controller';
import { MetadataController } from '@api/users/presentation/controller/metadata.controller';
import { UsersController } from '@api/users/presentation/controller/users.controller';

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
      imports: [
        ThrottlerModule.forRoot({
          storage: new BoundedThrottlerStorage(),
          throttlers: [{ ttl: 60_000, limit: 300 }],
        }),
      ],
      controllers: [UsersController, ConsentController, MetadataController],
      providers: [
        { provide: UserService, useValue: users },
        { provide: ConsentService, useValue: consents },
        { provide: MetadataService, useValue: metadata },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
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
    await app.listen(0);
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

  it('정의되지 않은 필드와 잘못된 동의 항목 타입을 Z005로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/users/join')
      .send({
        nickname: '모각러',
        job: '개발',
        address: '서울',
        consents: [{ consentItemId: '1', agreed: true }],
        unexpected: true,
      })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));

    expect(users.join).not.toHaveBeenCalled();
  });

  it('같은 IP의 닉네임 검증 요청은 분당 예순 번째까지만 서비스에 전달한다', async () => {
    users.verifyNickname.mockResolvedValue(undefined);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/users/nickname/verify')
        .send({ nickname: '모각러' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/api/users/nickname/verify')
      .send({ nickname: '모각러' })
      .expect(429)
      .expect({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });

    expect(users.verifyNickname).toHaveBeenCalledTimes(60);
  }, 10_000);

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
