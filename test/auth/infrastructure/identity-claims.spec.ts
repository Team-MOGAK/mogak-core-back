import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import { identityFromJwtClaims } from '../../../src/auth/infrastructure/verifier/identity-claims';

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
      new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN),
    );
  });
});
