import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { ConsentRepository } from '../infrastructure/consent.repository';
import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  it('rejects duplicate consent IDs before writing state', async () => {
    const repository = {
      listActiveItems: vi.fn(),
      findItemsByIds: vi.fn(),
      upsertUserConsents: vi.fn(),
      getMarketingConsents: vi.fn(),
      updateMarketingConsents: vi.fn(),
    } as unknown as ConsentRepository;
    const service = new ConsentService(repository);

    await expect(
      service.update(7, [
        { consentItemId: 1, agreed: true },
        { consentItemId: 1, agreed: false },
      ]),
    ).rejects.toEqual(new AppException(AppErrorCode.DUPLICATE_CONSENT_ITEM));
    expect(repository.upsertUserConsents).not.toHaveBeenCalled();
  });
});
