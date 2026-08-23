import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { jest } from '@jest/globals';
import { testMock } from '../../testMock';

import type { ConsentRepositoryPort } from '@core/users/application/port/consent.repository.port';
import { ConsentService } from '@core/users/application/service/consent.service';

function createRepository(): ConsentRepositoryPort {
  return {
    listActiveItems: testMock(),
    findItemsByIds: testMock(),
    upsertUserConsents: testMock(),
    getMarketingConsents: testMock(),
    updateMarketingConsents: testMock(),
  } as unknown as ConsentRepositoryPort;
}

function activeConsent(input: { id: number; code: string; required: boolean }) {
  return {
    ...input,
    name: input.code,
    description: null,
    active: true,
  };
}

describe('동의 서비스', () => {
  it('가입 동의 저장 중 잠금 후 사용자가 사라지면 USER_NOT_FOUND로 변환한다', async () => {
    const repository = createRepository();
    jest
      .mocked(repository.listActiveItems)
      .mockResolvedValue([activeConsent({ id: 1, code: 'TERMS', required: true })]);
    jest
      .mocked(repository.findItemsByIds)
      .mockResolvedValue([activeConsent({ id: 1, code: 'TERMS', required: true })]);
    jest
      .mocked(repository.upsertUserConsents)
      .mockRejectedValue(new DomainException(DomainErrorCode.USER_NOT_FOUND));
    const service = new ConsentService(repository);

    await expect(service.update(7, [{ consentItemId: 1, agreed: true }])).rejects.toEqual(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
    );
  });

  it('마케팅 동의 저장 중 잠금 후 사용자가 사라지면 USER_NOT_FOUND로 변환한다', async () => {
    const repository = createRepository();
    jest
      .mocked(repository.updateMarketingConsents)
      .mockRejectedValue(new DomainException(DomainErrorCode.USER_NOT_FOUND));
    const service = new ConsentService(repository);

    await expect(service.updateMarketing(7, { marketingAgreed: true })).rejects.toEqual(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
    );
  });

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
    ).rejects.toEqual(new DomainException(DomainErrorCode.DUPLICATE_CONSENT_ITEM));
    expect(repository.upsertUserConsents).not.toHaveBeenCalled();
  });
});
