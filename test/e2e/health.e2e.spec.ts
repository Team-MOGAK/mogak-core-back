import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { jest } from '@jest/globals';
import { ALERT_NOTIFIER } from '@infra/alerting/alertNotifier';
import { PG_POOL } from '@infra/database/database.tokens';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '@api/app.setup';

describe('헬스체크 엔드포인트', () => {
  let app: INestApplication;
  const query = jest.fn<() => Promise<unknown>>();
  const notify = jest.fn();

  beforeEach(async () => {
    query.mockReset().mockResolvedValue({ rows: [{ value: 1 }] });
    notify.mockReset();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, end: jest.fn() })
      .overrideProvider(ALERT_NOTIFIER)
      .useValue({ notify })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('애플리케이션 응답 포맷 없이 정상 상태를 반환한다', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('DB 연결이 정상이면 readiness 200을 반환한다', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200).expect({ status: 'ok' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('DB 실패에서도 전역 필터에 의해 변환되지 않는 안전한 503을 반환한다', async () => {
    query.mockRejectedValue(new Error('PRIVATE_DATABASE_SENTINEL'));
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({ status: 'unavailable' });
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });
  it('readiness 실패가 반복돼도 상태 전이 시점에만 알림을 보낸다', async () => {
    const server = app.getHttpServer();
    query.mockRejectedValue(new Error('PRIVATE_DATABASE_SENTINEL'));
    for (let i = 0; i < 5; i += 1) {
      await request(server).get('/health/ready').expect(503);
    }
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: 'readiness_failed', statusCode: 503 }),
    );

    query.mockResolvedValue({ rows: [{ value: 1 }] });
    await request(server).get('/health/ready').expect(200);
    await request(server).get('/health/ready').expect(200);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: 'readiness_recovered' }),
    );
    expect(JSON.stringify(notify.mock.calls)).not.toContain('PRIVATE_DATABASE_SENTINEL');
  });
});
