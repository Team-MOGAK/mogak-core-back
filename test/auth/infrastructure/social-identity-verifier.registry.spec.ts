import { testMock } from '../../test-mock';

import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import type { SocialIdentityVerifier } from '../../../src/auth/application/port/social-identity-verifier.port';
import { SocialIdentityVerifierRegistry } from '../../../src/auth/infrastructure/verifier/social-identity-verifier.registry';

describe('소셜 식별자 검증기 레지스트리', () => {
  it('요청한 공급자를 지원하는 검증기를 선택한다', async () => {
    const google = {
      supports: testMock().mockReturnValue(true),
      verify: testMock().mockResolvedValue({
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

  it('일치하는 검증기가 없으면 기존 미지원 공급자 오류를 반환한다', async () => {
    const registry = new SocialIdentityVerifierRegistry([]);

    await expect(registry.verify('KAKAO', 'access-token')).rejects.toEqual(
      new DomainException(AppErrorCode.UNSUPPORTED_SOCIAL_PROVIDER),
    );
  });
});
