import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { KakaoIdentityVerifier } from './kakao-identity-verifier';

describe('KakaoIdentityVerifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a verified Kakao account response to a social identity', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 12345,
          kakao_account: {
            email: 'mogak@example.test',
            is_email_valid: true,
            is_email_verified: true,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(new KakaoIdentityVerifier().verify('kakao-access-token')).resolves.toEqual({
      provider: 'KAKAO',
      providerUserId: '12345',
      email: 'mogak@example.test',
      emailVerified: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://kapi.kakao.com/v2/user/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer kakao-access-token' } }),
    );
  });

  it('does not expose an upstream response when the token is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('invalid token', { status: 401 })),
    );

    await expect(new KakaoIdentityVerifier().verify('kakao-access-token')).rejects.toEqual(
      new AppException(AppErrorCode.INVALID_SOCIAL_TOKEN),
    );
  });
});
