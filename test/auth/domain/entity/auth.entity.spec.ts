import { canRotateSession } from '../../../../apps/api/src/core/auth/domain/policy/authSession.policy';
import { validateNewSocialIdentity } from '../../../../apps/api/src/core/auth/domain/policy/socialIdentity.policy';

const now = new Date('2026-07-25T00:00:00.000Z');

function session(refreshTokenHash: string) {
  return {
    refreshTokenHash,
    expiresAt: new Date('2026-08-25T00:00:00.000Z'),
  };
}

describe('인증 도메인 규칙', () => {
  it('활성 세션의 리프레시 해시가 일치할 때만 회전을 허용한다', () => {
    expect(canRotateSession(session('current-hash'), 'current-hash', now)).toEqual({
      success: true,
    });
    expect(canRotateSession(session('current-hash'), 'wrong-hash', now)).toEqual({
      success: false,
      reason: 'REFRESH_TOKEN_MISMATCH',
    });
  });

  it('이메일이 없는 구글 식별자를 거부한다', () => {
    expect(
      validateNewSocialIdentity({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: null,
        emailVerified: false,
      }),
    ).toEqual({ success: false, reason: 'EMAIL_REQUIRED' });
  });
});
