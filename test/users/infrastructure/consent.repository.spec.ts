import { testMock } from '../../testMock';

import type { Database } from '@infra/database/database.provider';
import { UserPersistenceException } from '@core/users/domain/exception/userPersistence.exception';
import { ConsentUserNotFoundAfterLockException } from '@core/users/domain/exception/userPersistence.exception';
import { ConsentRepository } from '@infra/users/repository/consent.repository';

describe('동의 저장소', () => {
  it.each([
    ['가입 동의', 'upsertUserConsents'],
    ['마케팅 동의', 'updateMarketingConsents'],
  ] as const)(
    '잠금 뒤 사용자가 없으면 %s을 삽입하지 않고 전용 예외를 던진다',
    async (_, method) => {
      const execute = testMock().mockResolvedValue(undefined);
      const whereAfterLock = testMock().mockResolvedValue([]);
      const fromAfterLock = testMock().mockReturnValue({ where: whereAfterLock });
      const selectAfterLock = testMock().mockReturnValue({ from: fromAfterLock });
      const insert = testMock();
      const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
        callback({ execute, select: selectAfterLock, insert }),
      );
      const repository = new ConsentRepository({
        transaction,
        ...(method === 'updateMarketingConsents'
          ? {
              select: testMock().mockReturnValue({
                from: testMock().mockReturnValue({
                  where: testMock().mockResolvedValue([{ id: 1, code: 'MARKETING', active: true }]),
                }),
              }),
            }
          : {}),
      } as unknown as Database);

      const call =
        method === 'upsertUserConsents'
          ? repository.upsertUserConsents(7, [{ consentItemId: 1, agreed: true }], new Date())
          : repository.updateMarketingConsents(7, { marketingAgreed: true }, new Date());

      await expect(call).rejects.toBeInstanceOf(ConsentUserNotFoundAfterLockException);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(selectAfterLock).toHaveBeenCalledTimes(1);
      expect(insert).not.toHaveBeenCalled();
    },
  );

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
        new Date('2026-07-25T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(UserPersistenceException);
  });
});
