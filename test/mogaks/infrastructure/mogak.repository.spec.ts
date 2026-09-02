import { testMock } from '../../testMock';
import { pinoLoggerStub } from '../../fixtures/pinoLogger.fixture';

import type { Database } from '@infra/database/database.provider';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { MogakPersistenceException } from '@core/mogaks/domain/exception/mogakPersistence.exception';
import { MogakRepository } from '@infra/mogaks/repository/mogak.repository';

describe('모각 저장소', () => {
  it('잠금 뒤 사용자가 없으면 모다랫을 삽입하지 않고 전용 예외를 던진다', async () => {
    const where = testMock().mockResolvedValue([]);
    const from = testMock().mockReturnValue({ where });
    const select = testMock().mockReturnValue({ from });
    const insert = testMock();
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ select, insert }),
    );
    const repository = new MogakRepository(
      { transaction } as unknown as Database,
      pinoLoggerStub(),
    );

    await expect(
      repository.createModarat({ userId: 7, title: '모다랫', color: '#000000' }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.USER_NOT_FOUND));
    expect(select).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it('모다랫 삽입 결과가 없으면 MogakPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const where = testMock().mockResolvedValue([{ id: 7 }]);
    const from = testMock().mockReturnValue({ where });
    const select = testMock().mockReturnValue({ from });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute: testMock(), select, insert }),
    );
    const repository = new MogakRepository(
      { transaction } as unknown as Database,
      pinoLoggerStub(),
    );

    await expect(
      repository.createModarat({ userId: 7, title: '모다랫', color: '#000000' }),
    ).rejects.toBeInstanceOf(MogakPersistenceException);
  });

  it('지원하지 않는 저장된 실행 상태를 MogakPersistenceException으로 거부한다', async () => {
    const findFirst = testMock().mockResolvedValue({
      id: 1,
      jogakId: 2,
      scheduledDate: '2026-07-25',
      status: 'CANCELLED',
      jogakTitleSnapshot: '조각',
    });
    const repository = new MogakRepository(
      {
        query: { jogakExecutions: { findFirst } },
      } as unknown as Database,
      pinoLoggerStub(),
    );

    await expect(repository.findExecution(2, '2026-07-25')).rejects.toBeInstanceOf(
      MogakPersistenceException,
    );
  });
});
