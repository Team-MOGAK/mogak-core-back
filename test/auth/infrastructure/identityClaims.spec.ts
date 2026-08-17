import { CoreError } from '../../../apps/api/src/core/common/error/coreError';
import { identityFromJwtClaims } from '../../../apps/api/src/infrastructure/auth/verifier/identityClaims';

describe('식별 토큰 클레임 해석', () => {
  it('식별 토큰의 문자열 이메일 검증 클레임을 정규화한다', () => {
    expect(
      identityFromJwtClaims('GOOGLE', {
        sub: 'google-subject',
        email: 'mogak@example.test',
        email_verified: 'true',
      }),
    ).toEqual({
      provider: 'GOOGLE',
      providerUserId: 'google-subject',
      email: 'mogak@example.test',
      emailVerified: true,
    });
  });

  it('공급자 subject가 없는 토큰을 거부한다', () => {
    expect(() => identityFromJwtClaims('APPLE', { email: 'mogak@example.test' })).toThrow(
      new CoreError('INVALID_SOCIAL_TOKEN'),
    );
  });
});
