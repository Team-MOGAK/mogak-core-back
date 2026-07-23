import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApp } from '../../../app.setup';
import { AccessTokenGuard } from '../../auth/presentation/access-token.guard';
import { MogaksService } from '../application/mogaks.service';
import { MogaksMetadataController } from './mogaks-metadata.controller';
import { ModaratsMogaksController } from './modarats-mogaks.controller';

describe('Modarat and Mogak HTTP contract', () => {
  let app: INestApplication;
  const mogaks = {
    createModarat: vi.fn(),
    listModarats: vi.fn(),
    getModarat: vi.fn(),
    updateModarat: vi.fn(),
    deleteModarat: vi.fn(),
    createMogak: vi.fn(),
    listMogaks: vi.fn(),
    updateMogak: vi.fn(),
    deleteMogak: vi.fn(),
    listCategories: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ModaratsMogaksController, MogaksMetadataController],
      providers: [{ provide: MogaksService, useValue: mogaks }],
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

  it('creates Modarats with a created BaseResponse envelope and retains its empty delete body', async () => {
    mogaks.createModarat.mockResolvedValue({ id: 3, title: '여름 목표', color: 'blue' });

    await request(app.getHttpServer())
      .post('/api/modarats')
      .send({ title: '여름 목표', color: 'blue' })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'CREATED', code: 'created', result: { id: 3 } }),
      );

    await request(app.getHttpServer()).delete('/api/modarats/3').expect(200).expect('');
    expect(mogaks.deleteModarat).toHaveBeenCalledWith(7, 3);
  });

  it('accepts flattened category input and returns server-owned category metadata', async () => {
    mogaks.createMogak.mockResolvedValue({
      id: 9,
      title: '정보처리기사',
      color: null,
      category: { code: 'CERTIFICATION', name: '자격증' },
    });
    mogaks.listCategories.mockResolvedValue([{ code: 'CERTIFICATION', name: '자격증' }]);

    await request(app.getHttpServer())
      .post('/api/mogaks')
      .send({ modaratId: 3, title: '정보처리기사', categoryCode: 'CERTIFICATION' })
      .expect(201)
      .expect(({ body }) =>
        expect(body.result.category).toEqual({ code: 'CERTIFICATION', name: '자격증' }),
      );
    expect(mogaks.createMogak).toHaveBeenCalledWith(7, {
      modaratId: 3,
      title: '정보처리기사',
      categoryCode: 'CERTIFICATION',
    });

    await request(app.getHttpServer())
      .get('/api/metadata/mogak-categories')
      .expect(200)
      .expect(({ body }) =>
        expect(body.result).toEqual([{ code: 'CERTIFICATION', name: '자격증' }]),
      );
  });

  it('keeps the existing color metadata path and response shape', async () => {
    await request(app.getHttpServer())
      .get('/api/metadata/colors')
      .expect(200)
      .expect(({ body }) =>
        expect(body.result).toEqual([
          { name: '#475FFD' },
          { name: '#FF4C77' },
          { name: '#F98A08' },
          { name: '#11D796' },
          { name: '#FF6827' },
          { name: '#9C31FF' },
          { name: '#21CAFF' },
          { name: '#FF2F2F' },
        ]),
      );
  });
});
