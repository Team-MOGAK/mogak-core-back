import { AUTH_TOKEN_VERIFIER } from '../../../apps/api/src/core/auth/application/port/authTokenVerifier.port';
import { SESSION_TOKEN_ISSUER } from '../../../apps/api/src/core/auth/application/port/sessionTokenIssuer.port';

describe('세션 토큰 Port', () => {
  it('발급과 검증 역할의 DI 토큰을 분리한다', () => {
    expect(SESSION_TOKEN_ISSUER.description).toBe('SESSION_TOKEN_ISSUER');
    expect(AUTH_TOKEN_VERIFIER.description).toBe('AUTH_TOKEN_VERIFIER');
  });
});
