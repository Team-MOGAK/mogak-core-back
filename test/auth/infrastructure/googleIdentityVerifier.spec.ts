import { GOOGLE_ISSUERS } from '@infra/auth/verifier/googleIdentityVerifier';

describe('Google ID 토큰 검증 설정', () => {
  it('Google이 발급하는 두 issuer만 허용한다', () => {
    expect(GOOGLE_ISSUERS).toEqual(['https://accounts.google.com', 'accounts.google.com']);
  });
});
