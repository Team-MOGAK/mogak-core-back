import { jest } from '@jest/globals';
import { testMock } from '../../testMock';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '@api/app.setup';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';
import { MogakService } from '@core/mogaks/application/service/mogak.service';
import { MogakMetadataController } from '@api/mogaks/presentation/controller/mogakMetadata.controller';
import { ModaratMogakController } from '@api/mogaks/presentation/controller/modaratMogak.controller';

describe('모다랏과 모각 HTTP 계약', () => {
  let app: INestApplication;
  const mogaks = {
    createModarat: testMock(),
    listModarats: testMock(),
    getModarat: testMock(),
    updateModarat: testMock(),
    deleteModarat: testMock(),
    createMogak: testMock(),
    listMogaks: testMock(),
    updateMogak: testMock(),
    deleteMogak: testMock(),
    listCategories: testMock(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ModaratMogakController, MogakMetadataController],
      providers: [{ provide: MogakService, useValue: mogaks }, RegisteredUserGuard],
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
    configureApp(app, { corsAllowedOrigins: ['https://mobile.mogak.test'] });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('생성 응답 포맷으로 모다랏을 만들고 빈 삭제 본문을 유지한다', async () => {
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

  it('공백뿐인 모다랏 제목을 잘못된 요청으로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/modarats')
      .send({ title: '   ', color: 'blue' })
      .expect(400);
    expect(mogaks.createModarat).not.toHaveBeenCalled();
  });

  it('정의되지 않은 모각 필드와 잘못된 path ID를 Z005로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/mogaks')
      .send({ modaratId: 3, title: '정보처리기사', unexpected: true })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));
    await request(app.getHttpServer())
      .get('/api/modarats/not-a-number')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));

    expect(mogaks.createMogak).not.toHaveBeenCalled();
    expect(mogaks.getModarat).not.toHaveBeenCalled();
  });

  it('평면 카테고리 입력을 받고 서버 소유 카테고리 메타데이터를 반환한다', async () => {
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

  it('기존 색상 메타데이터 경로와 응답 형태를 유지한다', async () => {
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

  it('모다랏 PATCH는 canonical media type과 생략 필드 보존 명령을 사용한다', async () => {
    mogaks.updateModarat.mockResolvedValue({ id: 3, title: '여름 목표', color: '#475FFD' });

    await request(app.getHttpServer())
      .patch('/api/modarats/3')
      .set('Content-Type', 'Application/Merge-Patch+Json; charset=utf-8')
      .send({ color: '#475FFD' })
      .expect(200)
      .expect('Accept-Patch', 'application/merge-patch+json');

    expect(mogaks.updateModarat).toHaveBeenCalledWith(7, 3, { color: '#475FFD' });
  });

  it('모각 PATCH는 canonical media type만 받고 이전 PUT은 PATCH 안내와 함께 거부한다', async () => {
    await request(app.getHttpServer())
      .patch('/api/mogaks/9')
      .send({ title: '수정' })
      .expect(415)
      .expect('Accept-Patch', 'application/merge-patch+json')
      .expect(({ body }) => expect(body.code).toBe('Z007'));

    await request(app.getHttpServer())
      .put('/api/mogaks/9')
      .set('Origin', 'https://mobile.mogak.test')
      .send({ title: '수정' })
      .expect(405)
      .expect('Allow', 'PATCH')
      .expect('Access-Control-Allow-Origin', 'https://mobile.mogak.test');

    await request(app.getHttpServer())
      .options('/api/mogaks/9')
      .set('Origin', 'https://mobile.mogak.test')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204)
      .expect('Access-Control-Allow-Headers', /Content-Type/i)
      .expect('Access-Control-Expose-Headers', /Accept-Patch/i);

    await request(app.getHttpServer())
      .put('/api/posts/9')
      .send({ contents: '유지되는 PUT' })
      .expect(404);
  });

  it('모각 PATCH는 SYSTEM 카테고리 객체를 변경 명령으로 전달한다', async () => {
    mogaks.updateMogak.mockResolvedValue({
      id: 9,
      title: '정보처리기사',
      color: '#475FFD',
      category: { code: 'CERTIFICATION', name: '자격증' },
    });

    await request(app.getHttpServer())
      .patch('/api/mogaks/9')
      .set('Content-Type', 'application/merge-patch+json')
      .send({ category: { type: 'SYSTEM', code: 'CERTIFICATION' } })
      .expect(200);

    expect(mogaks.updateMogak).toHaveBeenCalledWith(7, 9, {
      category: { type: 'SYSTEM', code: 'CERTIFICATION' },
    });
  });

  it('모각 PATCH는 CUSTOM 카테고리 객체를 변경 명령으로 전달한다', async () => {
    mogaks.updateMogak.mockResolvedValue({
      id: 9,
      title: '정보처리기사',
      color: '#475FFD',
      category: { code: 'CERTIFICATION', name: '자격증' },
    });

    await request(app.getHttpServer())
      .patch('/api/mogaks/9')
      .set('Content-Type', 'application/merge-patch+json')
      .send({ category: { type: 'CUSTOM', name: '코딩 테스트' } })
      .expect(200);

    expect(mogaks.updateMogak).toHaveBeenCalledWith(7, 9, {
      category: { type: 'CUSTOM', name: '코딩 테스트' },
    });
  });

  it('모각 PATCH는 type 없는 이전 category 표현을 거부한다', async () => {
    await request(app.getHttpServer())
      .patch('/api/mogaks/9')
      .set('Content-Type', 'application/merge-patch+json')
      .send({ category: { code: 'CERTIFICATION' } })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('Z005'));

    expect(mogaks.updateMogak).not.toHaveBeenCalled();
  });
});
