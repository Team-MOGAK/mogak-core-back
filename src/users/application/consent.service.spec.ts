import { testMock } from '../../../test/test-mock';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import type { ConsentRepository } from '../infrastructure/consent.repository';
import { ConsentService } from './consent.service';

describe('동의 서비스', () => {
  it('상태를 저장하기 전에 중복 동의 식별자를 거부한다', async () => {
    const repository = {
      listActiveItems: testMock(),
      findItemsByIds: testMock(),
      upsertUserConsents: testMock(),
      getMarketingConsents: testMock(),
      updateMarketingConsents: testMock(),
    } as unknown as ConsentRepository;
    const service = new ConsentService(repository);

    await expect(
      service.update(7, [
        { consentItemId: 1, agreed: true },
        { consentItemId: 1, agreed: false },
      ]),
    ).rejects.toEqual(new DomainException(AppErrorCode.DUPLICATE_CONSENT_ITEM));
    expect(repository.upsertUserConsents).not.toHaveBeenCalled();
  });
});
