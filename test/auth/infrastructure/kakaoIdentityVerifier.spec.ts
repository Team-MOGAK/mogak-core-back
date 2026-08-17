import { DomainException } from '@core/common/error/domainException';
import { jest } from '@jest/globals';
import { KakaoIdentityVerifier } from '@infra/auth/verifier/kakaoIdentityVerifier';

describe('카카오 식별자 검증기', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('검증된 카카오 계정 응답을 소셜 식별자로 변환한다', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
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
    await expect(new KakaoIdentityVerifier().verify('kakao-accessToken')).resolves.toEqual({
      provider: 'KAKAO',
      providerUserId: '12345',
      email: 'mogak@example.test',
      emailVerified: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://kapi.kakao.com/v2/user/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer kakao-accessToken' } }),
    );
  });

  it('토큰이 거부되면 외부 응답을 노출하지 않는다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('invalid token', { status: 401 }));

    await expect(new KakaoIdentityVerifier().verify('kakao-accessToken')).rejects.toEqual(
      new DomainException('INVALID_SOCIAL_TOKEN'),
    );
  });
});
