import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { SocialIdentityVerifier } from '../domain/social-identity-verifier.port';
import { SocialIdentityVerifierRegistry } from './social-identity-verifier.registry';

describe('SocialIdentityVerifierRegistry', () => {
  it('selects the verifier that supports the requested provider', async () => {
    const google = {
      supports: vi.fn().mockReturnValue(true),
      verify: vi.fn().mockResolvedValue({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } satisfies SocialIdentityVerifier;
    const registry = new SocialIdentityVerifierRegistry([google]);

    await expect(registry.verify('GOOGLE', 'id-token')).resolves.toMatchObject({
      providerUserId: 'google-subject',
    });
    expect(google.verify).toHaveBeenCalledWith('id-token');
  });

  it('returns the existing unsupported-provider error when no verifier matches', async () => {
    const registry = new SocialIdentityVerifierRegistry([]);

    await expect(registry.verify('KAKAO', 'access-token')).rejects.toEqual(
      new AppException(AppErrorCode.UNSUPPORTED_SOCIAL_PROVIDER),
    );
  });
});
