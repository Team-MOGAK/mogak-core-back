import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { MetadataService } from '../../src/users/application/service/metadata.service';

describe('전역 HTTP rate limit', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MetadataService)
      .useValue({ jobs: async () => [], addresses: async () => [] })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('일반 API는 분당 삼백 번째까지 허용하고 다음 요청은 기본 429를 반환한다', async () => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      await request(app.getHttpServer()).get('/api/metadata/jobs').expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/metadata/jobs')
      .expect(429)
      .expect({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
  }, 20_000);

  it('헬스 체크는 전역 rate limit에서 제외한다', async () => {
    for (let attempt = 0; attempt < 301; attempt += 1) {
      await request(app.getHttpServer()).get('/health').expect(200);
    }
  }, 20_000);
});
