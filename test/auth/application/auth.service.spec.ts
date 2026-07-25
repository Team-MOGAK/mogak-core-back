import { jest } from '@jest/globals';
import { testMock } from '../../test-mock';
import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import type { AuthPersistencePort } from '../../../src/auth/application/port/auth-persistence.port';
import type { SocialIdentityVerifierPort } from '../../../src/auth/application/port/social-identity-verifier.port';
import type { TokenIssuerPort } from '../../../src/auth/application/port/token-issuer.port';
import { AuthService } from '../../../src/auth/application/service/auth.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createTokenIssuer(): TokenIssuerPort {
  return {
    issue: testMock().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    verifyAccess: testMock(),
    verifyRefresh: testMock(),
    hashRefreshToken: testMock().mockReturnValue('refresh-token-hash'),
  };
}

function createPersistence(): AuthPersistencePort {
  return {
    findUserById: testMock(),
    findUserByEmail: testMock(),
    findUserBySocialIdentity: testMock(),
    createAccount: testMock(),
    createSession: testMock(),
    rotateSession: testMock(),
    isSessionActive: testMock(),
    deleteSession: testMock(),
    deleteUser: testMock(),
  };
}

describe('인증 서비스', () => {
  it('새로 검증된 구글 식별자로 대기 사용자와 세션을 생성한다', async () => {
    const verifiers = {
      verify: testMock().mockResolvedValue({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    jest.mocked(persistence.createAccount).mockImplementation(
      async (_input, createSession) =>
        (
          await createSession({
            id: 7,
            email: 'mogak@example.test',
            nickname: null,
            role: 'PENDING',
          })
        ).result,
    );
    const service = new AuthService(verifiers, persistence, createTokenIssuer(), () => SESSION_ID);

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      isRegistered: false,
      userId: 7,
      tokens: expect.objectContaining({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      }),
    });
    expect(persistence.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          email: 'mogak@example.test',
          provider: 'GOOGLE',
          providerUserId: 'google-subject',
          emailVerified: true,
        }),
      }),
      expect.any(Function),
    );
  });

  it('이메일이 다른 사용자에게 속한다는 이유만으로 새 식별자를 연결하지 않는다', async () => {
    const verifiers = {
      verify: testMock().mockResolvedValue({
        provider: 'KAKAO',
        providerUserId: 'kakao-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    jest.mocked(persistence.findUserByEmail).mockResolvedValue({
      id: 3,
      email: 'mogak@example.test',
      nickname: '기존사용자',
      role: 'USER',
    });
    const service = new AuthService(verifiers, persistence, createTokenIssuer(), () => SESSION_ID);

    await expect(service.login('KAKAO', 'access-token')).rejects.toEqual(
      new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED),
    );
    expect(persistence.createAccount).not.toHaveBeenCalled();
  });

  it('이메일 없는 카카오 식별자는 허용하고 미검증 구글 이메일은 거부한다', async () => {
    const verifiers = {
      verify: testMock()
        .mockResolvedValueOnce({
          provider: 'KAKAO',
          providerUserId: 'kakao-subject',
          email: null,
          emailVerified: false,
        })
        .mockResolvedValueOnce({
          provider: 'GOOGLE',
          providerUserId: 'google-subject',
          email: 'mogak@example.test',
          emailVerified: false,
        }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    jest
      .mocked(persistence.createAccount)
      .mockImplementation(
        async (_input, createSession) =>
          (await createSession({ id: 7, email: null, nickname: null, role: 'PENDING' })).result,
      );
    const service = new AuthService(verifiers, persistence, createTokenIssuer(), () => SESSION_ID);

    await expect(service.login('KAKAO', 'access-token')).resolves.toMatchObject({ userId: 7 });
    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(AppErrorCode.SOCIAL_EMAIL_NOT_VERIFIED),
    );
  });
});
