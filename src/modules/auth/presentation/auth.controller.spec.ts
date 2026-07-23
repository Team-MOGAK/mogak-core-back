import { jest } from '@jest/globals';
import { testMock } from '../../../../test/test-mock';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../../../app.setup';
import { AuthService } from '../application/auth.service';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';

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
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('기존 애플 로그인 경로와 응답 포맷을 유지한다', async () => {
    authService.login.mockResolvedValue({
      isRegistered: false,
      userId: 7,
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ id_token: 'apple-id-token' })
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
});
