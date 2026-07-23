import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../../../app.setup';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { JogaksService } from '../application/jogaks.service';
import { JogaksController } from './jogaks.controller';

describe('Jogak HTTP contract', () => {
  let app: INestApplication;
  const jogaks = {
    create: vi.fn(),
    listDay: vi.fn(),
    listOneTime: vi.fn(),
    listRoutines: vi.fn(),
    listMogakDay: vi.fn(),
    getDetail: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commandExecution: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [JogaksController],
      providers: [{ provide: JogaksService, useValue: jogaks }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) => {
          context.switchToHttp().getRequest().user = {
            userId: 7,
            role: 'USER',
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

  it('returns a virtual occurrence identified by Jogak ID and scheduled date', async () => {
    jogaks.listDay.mockResolvedValue({
      size: 1,
      jogaks: [{ jogakId: 11, scheduledDate: '2026-07-23', status: 'PENDING' }],
    });

    await request(app.getHttpServer())
      .get('/api/jogaks?date=2026-07-23')
      .expect(200)
      .expect(({ body }) =>
        expect(body.result).toEqual({
          size: 1,
          jogaks: [{ jogakId: 11, scheduledDate: '2026-07-23', status: 'PENDING' }],
        }),
      );
    expect(jogaks.listDay).toHaveBeenCalledWith(7, '2026-07-23');
  });

  it('keeps Jogak creation and date-list paths while removing DailyJogak IDs', async () => {
    jogaks.create.mockResolvedValue({
      jogakId: 11,
      schedule: { scheduleType: 'WEEKLY', effectiveFrom: '2026-07-20', weekdays: ['MONDAY'] },
    });
    jogaks.listOneTime.mockResolvedValue({
      size: 1,
      jogaks: [{ jogakId: 12, scheduledDate: '2026-07-23', status: 'PENDING' }],
    });
    jogaks.listRoutines.mockResolvedValue([
      { jogakId: 11, scheduledDate: '2026-07-23', status: 'SUCCESS' },
    ]);
    jogaks.listMogakDay.mockResolvedValue([
      { jogakId: 11, scheduledDate: '2026-07-23', status: 'SUCCESS' },
    ]);

    await request(app.getHttpServer())
      .post('/api/jogaks')
      .send({
        mogakId: 3,
        title: '문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-20',
          weekdays: ['MONDAY'],
        },
      })
      .expect(201)
      .expect(({ body }) => expect(body.result.jogakId).toBe(11));
    expect(jogaks.create).toHaveBeenCalledWith(7, {
      mogakId: 3,
      title: '문제 풀이',
      schedule: { scheduleType: 'WEEKLY', effectiveFrom: '2026-07-20', weekdays: ['MONDAY'] },
    });

    await request(app.getHttpServer())
      .post('/api/jogaks')
      .send({
        mogakId: 3,
        title: '기존 요청 호환',
        isRoutine: true,
        today: '2026-07-20',
        endDate: '2026-08-31',
        days: ['MONDAY'],
      })
      .expect(201);
    expect(jogaks.create).toHaveBeenLastCalledWith(7, {
      mogakId: 3,
      title: '기존 요청 호환',
      schedule: {
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        effectiveTo: '2026-08-31',
        weekdays: ['MONDAY'],
      },
    });

    await request(app.getHttpServer())
      .get('/api/jogaks/daily?date=2026-07-23')
      .expect(200)
      .expect(({ body }) => expect(body.result.jogaks[0].dailyJogakId).toBeUndefined());
    await request(app.getHttpServer())
      .get('/api/jogaks/routines?startDay=2026-07-20&endDay=2026-07-26')
      .expect(200)
      .expect(({ body }) => expect(body.result[0].scheduledDate).toBe('2026-07-23'));
    await request(app.getHttpServer())
      .get('/api/mogaks/3/jogaks?date=2026-07-23')
      .expect(200)
      .expect(({ body }) => expect(body.result[0].jogakId).toBe(11));
  });

  it('creates the first execution with POST and rejects the old daily-jogak route', async () => {
    jogaks.commandExecution.mockResolvedValue({
      created: true,
      execution: { jogakId: 11, scheduledDate: '2026-07-23', status: 'IN_PROGRESS' },
    });

    await request(app.getHttpServer())
      .post('/api/jogaks/11/executions/2026-07-23/start')
      .expect(201)
      .expect(({ body }) => expect(body.result.status).toBe('IN_PROGRESS'));
    expect(jogaks.commandExecution).toHaveBeenCalledWith(7, 11, '2026-07-23', 'IN_PROGRESS');

    await request(app.getHttpServer()).put('/api/daily-jogaks/19/success').expect(404);
  });

  it('keeps authenticated Jogak detail, title update, and hard-delete paths', async () => {
    jogaks.getDetail.mockResolvedValue({ jogakId: 11, title: '문제 풀이' });
    jogaks.update.mockResolvedValue({ jogakId: 11, title: '수정된 문제 풀이' });

    await request(app.getHttpServer())
      .get('/api/jogaks/11')
      .expect(200)
      .expect(({ body }) => expect(body.result).toEqual({ jogakId: 11, title: '문제 풀이' }));
    await request(app.getHttpServer())
      .put('/api/jogaks/11')
      .send({
        title: '수정된 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-24',
          weekdays: ['THURSDAY', 'FRIDAY'],
        },
      })
      .expect(200)
      .expect(({ body }) => expect(body.result.title).toBe('수정된 문제 풀이'));
    expect(jogaks.update).toHaveBeenCalledWith(7, 11, {
      title: '수정된 문제 풀이',
      schedule: {
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-24',
        weekdays: ['THURSDAY', 'FRIDAY'],
      },
    });

    await request(app.getHttpServer()).delete('/api/jogaks/11').expect(200);
    expect(jogaks.delete).toHaveBeenCalledWith(7, 11);
  });
});
