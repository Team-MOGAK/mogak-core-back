import { testMock } from '../../testMock';

import type { Database } from '@infra/database/database.provider';
import { UserPersistenceException } from '@core/users/domain/exception/userPersistence.exception';
import { ConsentRepository } from '@infra/users/repository/consent.repository';

describe('동의 저장소', () => {
  function upsertDatabase(marketingItems: readonly { id: number }[]) {
    const where = testMock().mockResolvedValue(marketingItems);
    const select = testMock().mockReturnValue({
      from: testMock().mockReturnValue({ where }),
    });
    const onConflictDoUpdate = testMock().mockResolvedValue(undefined);
    const insert = testMock().mockReturnValue({
      values: testMock().mockReturnValue({ onConflictDoUpdate }),
    });
    const updateWhere = testMock().mockResolvedValue(undefined);
    const update = testMock().mockReturnValue({
      set: testMock().mockReturnValue({ where: updateWhere }),
    });
    const transaction = testMock().mockImplementation(async (callback: unknown) =>
      (callback as (tx: unknown) => Promise<void>)({ select, insert, update }),
    );

    return {
      db: { transaction } as unknown as Database,
      update,
      onConflictDoUpdate,
    };
  }

  it('마케팅 또는 광고 동의가 아닌 변경은 마케팅 동의 버전을 올리지 않는다', async () => {
    const { db, update, onConflictDoUpdate } = upsertDatabase([]);
    const repository = new ConsentRepository(db);

    await repository.upsertUserConsents(
      7,
      [{ consentItemId: 3, agreed: true }],
      new Date('2026-07-25T00:00:00.000Z'),
    );

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('마케팅 또는 광고 동의 변경은 같은 트랜잭션에서 마케팅 동의 버전을 올린다', async () => {
    const { db, update, onConflictDoUpdate } = upsertDatabase([{ id: 1 }]);
    const repository = new ConsentRepository(db);

    await repository.upsertUserConsents(
      7,
      [{ consentItemId: 1, agreed: true }],
      new Date('2026-07-25T00:00:00.000Z'),
    );

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('비활성 마케팅 동의 항목을 UserPersistenceException으로 보고한다', async () => {
    const repository = new ConsentRepository({
      select: testMock().mockReturnValue({
        from: testMock().mockReturnValue({
          where: testMock().mockResolvedValue([{ id: 1, code: 'MARKETING', active: false }]),
        }),
      }),
    } as unknown as Database);

    await expect(
      repository.updateMarketingConsents(
        7,
        { marketingAgreed: true },
        1,
        new Date('2026-07-25T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(UserPersistenceException);
  });
});
