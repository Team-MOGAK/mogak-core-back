import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { MogaksRepository } from '../infrastructure/mogaks.repository';
import { MogaksService } from './mogaks.service';

function repository(): MogaksRepository {
  return {
    findOwnedModarat: vi.fn(),
    countMogaks: vi.fn(),
    findActiveCategoryByCode: vi.fn(),
    createMogak: vi.fn(),
    deleteOwnedModarat: vi.fn(),
  } as unknown as MogaksRepository;
}

describe('MogaksService', () => {
  it('creates a Mogak with an active official category code', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.findOwnedModarat).mockResolvedValue({
      id: 3,
      title: '여름 목표',
      color: 'blue',
    });
    vi.mocked(mogaks.countMogaks).mockResolvedValue(0);
    vi.mocked(mogaks.findActiveCategoryByCode).mockResolvedValue({
      id: 1,
      code: 'CERTIFICATION',
      name: '자격증',
    });
    vi.mocked(mogaks.createMogak).mockResolvedValue({
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

  it('rejects a request that includes both category forms', async () => {
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

  it('rejects the ninth sequential Mogak without creating a slot or lock', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.findOwnedModarat).mockResolvedValue({
      id: 3,
      title: '여름 목표',
      color: 'blue',
    });
    vi.mocked(mogaks.countMogaks).mockResolvedValue(8);
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

  it('does not report successful Modarat deletion when the authenticated user does not own it', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.deleteOwnedModarat).mockResolvedValue(false);
    const service = new MogaksService(mogaks);

    await expect(service.deleteModarat(7, 3)).rejects.toEqual(
      new AppException(AppErrorCode.MODARAT_NOT_FOUND),
    );
  });
});
