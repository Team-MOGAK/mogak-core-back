import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { HealthModule } from './health/health.module';
import { configureApp } from './app.setup';

describe('애플리케이션 CORS 설정', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { corsAllowedOrigins: ['https://app.mogak.kr'] });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('허용한 앱 origin 요청에만 CORS 응답 헤더를 보낸다', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://app.mogak.kr')
      .expect('Access-Control-Allow-Origin', 'https://app.mogak.kr');
  });

  it('허용하지 않은 origin 요청에는 CORS 응답 헤더를 보내지 않는다', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://other.example')
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      });
  });
});
