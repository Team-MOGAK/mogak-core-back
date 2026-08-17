import { CoreError } from '../../../apps/api/src/core/common/error/coreError';
import { testMock } from '../../testMock';

import type { ConsentRepositoryPort } from '../../../apps/api/src/core/users/application/port/consent.repository.port';
import { ConsentService } from '../../../apps/api/src/core/users/application/service/consent.service';

describe('동의 서비스', () => {
  it('상태를 저장하기 전에 중복 동의 식별자를 거부한다', async () => {
    const repository = {
      listActiveItems: testMock(),
      findItemsByIds: testMock(),
      upsertUserConsents: testMock(),
      getMarketingConsents: testMock(),
      updateMarketingConsents: testMock(),
    } as unknown as ConsentRepositoryPort;
    const service = new ConsentService(repository);

    await expect(
      service.update(7, [
        { consentItemId: 1, agreed: true },
        { consentItemId: 1, agreed: false },
      ]),
    ).rejects.toEqual(new CoreError('DUPLICATE_CONSENT_ITEM'));
    expect(repository.upsertUserConsents).not.toHaveBeenCalled();
  });
});
