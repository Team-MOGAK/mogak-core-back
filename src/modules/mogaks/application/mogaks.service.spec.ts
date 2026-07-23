import { jest } from '@jest/globals';
import { testMock } from '../../../../test/test-mock';
import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { MogaksRepository } from '../infrastructure/mogaks.repository';
import { MogaksService } from './mogaks.service';

function repository(): MogaksRepository {
  return {
    findOwnedModarat: testMock(),
    countMogaks: testMock(),
    findActiveCategoryByCode: testMock(),
    createMogak: testMock(),
    deleteOwnedModarat: testMock(),
    findOwnedMogak: testMock(),
  } as unknown as MogaksRepository;
}

describe('모각 서비스', () => {
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
    const service = new MogaksService(mogaks);

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
    const service = new MogaksService(repository());

    await expect(
      service.createMogak(7, {
        modaratId: 3,
        title: '준비',
        categoryCode: 'CERTIFICATION',
        customCategoryName: '코테',
      }),
    ).rejects.toEqual(new AppException(AppErrorCode.INVALID_PARAMETER));
  });

  it('예약 칸이나 잠금을 만들지 않고 아홉 번째 연속 모각을 거부한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedModarat).mockResolvedValue({
      id: 3,
      title: '여름 목표',
      color: 'blue',
    });
    jest.mocked(mogaks.countMogaks).mockResolvedValue(8);
    const service = new MogaksService(mogaks);

    await expect(
      service.createMogak(7, {
        modaratId: 3,
        title: '준비',
        customCategoryName: '코테',
      }),
    ).rejects.toEqual(new AppException(AppErrorCode.MAX_MOGAKS));
    expect(mogaks.createMogak).not.toHaveBeenCalled();
  });

  it('인증 사용자가 소유하지 않은 모다랏 삭제를 성공으로 반환하지 않는다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.deleteOwnedModarat).mockResolvedValue(false);
    const service = new MogaksService(mogaks);

    await expect(service.deleteModarat(7, 3)).rejects.toEqual(
      new AppException(AppErrorCode.MODARAT_NOT_FOUND),
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
    const service = new MogaksService(mogaks);

    await expect(service.resolveOwnedMogak(7, 9)).resolves.toEqual({ id: 9 });
  });
});
