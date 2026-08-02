import { testMock } from '../../testMock';

import type { Database } from '../../../src/database/database.provider';
import { MogaksPersistenceException } from '../../../src/mogaks/domain/exception/mogaksPersistence.exception';
import { MogaksRepository } from '../../../src/mogaks/infrastructure/repository/mogaks.repository';

describe('모각 저장소', () => {
  it('모다랫 삽입 결과가 없으면 MogaksPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const repository = new MogaksRepository({ insert } as unknown as Database);

    await expect(
      repository.createModarat({ userId: 7, title: '모다랫', color: '#000000' }),
    ).rejects.toBeInstanceOf(MogaksPersistenceException);
  });

  it('지원하지 않는 저장된 실행 상태를 MogaksPersistenceException으로 거부한다', async () => {
    const findFirst = testMock().mockResolvedValue({
      id: 1,
      jogakId: 2,
      scheduledDate: '2026-07-25',
      status: 'CANCELLED',
      jogakTitleSnapshot: '조각',
    });
    const repository = new MogaksRepository({
      query: { jogakExecutions: { findFirst } },
    } as unknown as Database);

    await expect(repository.findExecution(2, '2026-07-25')).rejects.toBeInstanceOf(
      MogaksPersistenceException,
    );
  });
});
