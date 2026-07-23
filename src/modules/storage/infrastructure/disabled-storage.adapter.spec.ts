import { describe, expect, it } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { DisabledStorageAdapter } from './disabled-storage.adapter';

describe('DisabledStorageAdapter', () => {
  it('returns the existing storage-disabled error for an upload attempt', async () => {
    const storage = new DisabledStorageAdapter();

    await expect(storage.uploadProfile({} as Express.Multer.File)).rejects.toEqual(
      new AppException(AppErrorCode.STORAGE_DISABLED),
    );
  });

  it('does not expose a storage key as a public URL', async () => {
    await expect(new DisabledStorageAdapter().resolvePublicUrl('profile/key')).resolves.toBeNull();
  });
});
