import { jest } from '@jest/globals';
import { testMock } from '../../testMock';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

import { BoundedThrottlerStorage } from '@api/common/http/boundedThrottler.storage';
import { configureApp } from '@api/app.setup';
import { AuthService } from '@core/auth/application/service/auth.service';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { AuthController } from '@api/auth/presentation/controller/auth.controller';

describe('인증 HTTP 계약', () => {
  let app: INestApplication;
  const authService = {
    login: testMock(),
    refresh: testMock(),
    logout: testMock(),
    withdraw: testMock(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          storage: new BoundedThrottlerStorage(),
          throttlers: [{ ttl: 60_000, limit: 300 }],
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('공통 애플 로그인 경로와 응답 포맷을 유지한다', async () => {
    authService.login.mockResolvedValue({
      isRegistered: false,
      userId: 7,
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    });

    await request(app.getHttpServer())
      .post('/api/auth/apple/login')
      .send({ token: 'apple-id-token' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'OK',
          code: 'success',
          result: { isRegistered: false, userId: 7 },
        });
      });

    expect(authService.login).toHaveBeenCalledWith('APPLE', 'apple-id-token');
  });

  it('삭제된 레거시 애플 로그인 경로는 찾을 수 없다', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ id_token: 'apple-id-token' })
      .expect(404);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('리프레시 토큰 헤더와 기존 201 성공 응답 조합을 유지한다', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
    });

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('RefreshToken', 'current-refresh')
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'OK',
          code: 'success',
          result: { accessToken: 'next-access', refreshToken: 'next-refresh' },
        });
      });

    expect(authService.refresh).toHaveBeenCalledWith('current-refresh');
  });

  it('같은 IP의 로그인은 분당 스무 번째, 토큰 갱신은 예순 번째까지만 서비스에 전달한다', async () => {
    authService.login.mockResolvedValue({
      isRegistered: false,
      userId: 7,
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    });
    authService.refresh.mockResolvedValue({
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/google/login')
        .send({ token: 'google-id-token' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/api/auth/google/login')
      .send({ token: 'google-id-token' })
      .expect(429)
      .expect({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('RefreshToken', 'current-refresh')
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('RefreshToken', 'current-refresh')
      .expect(429)
      .expect({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });

    expect(authService.login).toHaveBeenCalledTimes(20);
    expect(authService.refresh).toHaveBeenCalledTimes(60);
  });
});
