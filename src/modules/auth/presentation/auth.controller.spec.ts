import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../../../app.setup';
import { AuthService } from '../application/auth.service';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let app: INestApplication;
  const authService = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    withdraw: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
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

  it('keeps the legacy Apple login path and response envelope', async () => {
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

  it('keeps RefreshToken header and the legacy 201/success envelope combination', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'next-access', refreshToken: 'next-refresh' });

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
