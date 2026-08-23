import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { jest } from '@jest/globals';
import { testMock } from '../../testMock';
import type { MogakRepositoryPort } from '@core/mogaks/application/port/mogak.repository.port';
import { MogakService } from '@core/mogaks/application/service/mogak.service';
import { ModaratUserNotFoundAfterLockException } from '@core/mogaks/domain/exception/mogakPersistence.exception';

function repository(): MogakRepositoryPort {
  return {
    createModarat: testMock(),
    findOwnedModarat: testMock(),
    countMogaks: testMock(),
    findActiveCategoryByCode: testMock(),
    createMogak: testMock(),
    deleteOwnedModarat: testMock(),
    findOwnedMogak: testMock(),
    updateOwnedModarat: testMock(),
    updateOwnedMogak: testMock(),
  } as unknown as MogakRepositoryPort;
}

describe('모각 서비스', () => {
  it('모다랫 생성 중 잠금 후 사용자가 사라지면 USER_NOT_FOUND로 변환한다', async () => {
    const mogaks = repository();
    jest
      .mocked(mogaks.createModarat)
      .mockRejectedValue(new ModaratUserNotFoundAfterLockException());
    const service = new MogakService(mogaks);

    await expect(service.createModarat(7, { title: '모다랫', color: 'blue' })).rejects.toEqual(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
    );
  });

  it('공백뿐인 모다랏 제목을 저장소 호출 전에 거부한다', async () => {
    const mogaks = repository();
    const service = new MogakService(mogaks);

    await expect(service.createModarat(7, { title: '   ', color: 'blue' })).rejects.toEqual(
      new DomainException(DomainErrorCode.INVALID_PARAMETER),
    );
    expect(mogaks.createModarat).not.toHaveBeenCalled();
  });

  it('활성화된 공식 카테고리 코드로 모각을 생성한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedModarat).mockResolvedValue({
      id: 3,
      title: '여름 목표',
      color: 'blue',
    });
    jest.mocked(mogaks.countMogaks).mockResolvedValue(0);
    jest.mocked(mogaks.findActiveCategoryByCode).mockResolvedValue({
      id: 1,
      code: 'CERTIFICATION',
      name: '자격증',
    });
    jest.mocked(mogaks.createMogak).mockResolvedValue({
      id: 9,
      modaratId: 3,
      title: '정보처리기사',
      color: null,
      categoryCode: 'CERTIFICATION',
      categoryName: '자격증',
      customCategoryName: null,
    });
    const service = new MogakService(mogaks);

    await expect(
      service.createMogak(7, {
        modaratId: 3,
        title: '정보처리기사',
        categoryCode: 'CERTIFICATION',
      }),
    ).resolves.toEqual({
      id: 9,
      title: '정보처리기사',
      color: null,
      category: { code: 'CERTIFICATION', name: '자격증' },
    });
    expect(mogaks.createMogak).toHaveBeenCalledWith(
      expect.objectContaining({ modaratId: 3, categoryId: 1, customCategoryName: null }),
    );
  });

  it('두 종류의 카테고리 입력을 함께 보낸 요청을 거부한다', async () => {
    const service = new MogakService(repository());

    await expect(
      service.createMogak(7, {
        modaratId: 3,
        title: '준비',
        categoryCode: 'CERTIFICATION',
        customCategoryName: '코테',
      }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.INVALID_PARAMETER));
  });

  it('예약 칸이나 잠금을 만들지 않고 아홉 번째 연속 모각을 거부한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedModarat).mockResolvedValue({
      id: 3,
      title: '여름 목표',
      color: 'blue',
    });
    jest.mocked(mogaks.countMogaks).mockResolvedValue(8);
    const service = new MogakService(mogaks);

    await expect(
      service.createMogak(7, {
        modaratId: 3,
        title: '준비',
        customCategoryName: '코테',
      }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.MAX_MOGAKS));
    expect(mogaks.createMogak).not.toHaveBeenCalled();
  });

  it('인증 사용자가 소유하지 않은 모다랏 삭제를 성공으로 반환하지 않는다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.deleteOwnedModarat).mockResolvedValue(false);
    const service = new MogakService(mogaks);

    await expect(service.deleteModarat(7, 3)).rejects.toEqual(
      new DomainException(DomainErrorCode.MODARAT_NOT_FOUND),
    );
  });

  it('저장소 소유권 조인을 노출하지 않고 종속 조회용 소유 모각을 해석한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedMogak).mockResolvedValue({
      id: 9,
      modaratId: 3,
      title: '정보처리기사',
      color: null,
      categoryCode: 'CERTIFICATION',
      categoryName: '자격증',
      customCategoryName: null,
    });
    const service = new MogakService(mogaks);

    await expect(service.resolveOwnedMogak(7, 9)).resolves.toEqual({ id: 9 });
  });

  it('모다랏 PATCH는 생략 필드를 undefined로 저장소에 전달한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.updateOwnedModarat).mockResolvedValue({
      id: 3,
      title: '여름 목표',
      color: '#475FFD',
    });

    await new MogakService(mogaks).updateModarat(7, 3, { color: '#475FFD' });

    expect(mogaks.updateOwnedModarat).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, modaratId: 3, color: '#475FFD' }),
    );
    expect(jest.mocked(mogaks.updateOwnedModarat).mock.calls[0]?.[0]).toHaveProperty(
      'title',
      undefined,
    );
  });

  it('모각 PATCH는 category 생략을 undefined로 저장소에 전달한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.updateOwnedMogak).mockResolvedValue({
      id: 9,
      modaratId: 3,
      title: '수정된 제목',
      color: '#475FFD',
      categoryCode: 'CERTIFICATION',
      categoryName: '자격증',
      customCategoryName: null,
    });

    await new MogakService(mogaks).updateMogak(7, 9, { title: '수정된 제목' });

    expect(mogaks.updateOwnedMogak).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, mogakId: 9, title: '수정된 제목' }),
    );
    const command = jest.mocked(mogaks.updateOwnedMogak).mock.calls[0]?.[0];
    expect(command).toHaveProperty('categoryId', undefined);
    expect(command).toHaveProperty('customCategoryName', undefined);
  });

  it('모각 PATCH의 tagged category를 저장 모델로 해석한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findActiveCategoryByCode).mockResolvedValue({
      id: 1,
      code: 'CERTIFICATION',
      name: '자격증',
    });
    jest.mocked(mogaks.updateOwnedMogak).mockResolvedValue({
      id: 9,
      modaratId: 3,
      title: '수정된 제목',
      color: '#475FFD',
      categoryCode: 'CERTIFICATION',
      categoryName: '자격증',
      customCategoryName: null,
    });
    const service = new MogakService(mogaks);

    await service.updateMogak(7, 9, { category: { type: 'SYSTEM', code: 'CERTIFICATION' } });
    await service.updateMogak(7, 9, { category: { type: 'CUSTOM', name: '코딩 테스트' } });

    expect(mogaks.updateOwnedMogak).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ categoryId: 1, customCategoryName: null }),
    );
    expect(mogaks.updateOwnedMogak).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ categoryId: null, customCategoryName: '코딩 테스트' }),
    );
  });
});
