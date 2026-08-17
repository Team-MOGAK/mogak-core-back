import { testMock } from '../../testMock';

import type { Database } from '../../../apps/api/src/infrastructure/database/database.provider';
import { UserPersistenceException } from '../../../apps/api/src/core/users/domain/exception/userPersistence.exception';
import { ConsentRepository } from '../../../apps/api/src/infrastructure/users/repository/consent.repository';

describe('동의 저장소', () => {
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
