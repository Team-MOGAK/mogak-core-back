import { jest } from '@jest/globals';
import { testMock } from '../../test-mock';
import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import type { AuthPersistencePort } from '../../../src/auth/application/port/auth-persistence.port';
import type { SocialIdentityVerifierPort } from '../../../src/auth/application/port/social-identity-verifier.port';
import type { TokenIssuerPort } from '../../../src/auth/application/port/token-issuer.port';
import { AuthService } from '../../../src/auth/application/service/auth.service';
import type { AuthenticatedPrincipal } from '../../../src/auth/application/type/authenticated-principal';
import {
  DuplicateEmailException,
  DuplicateSocialAccountException,
} from '../../../src/auth/domain/exception/auth-persistence.exception';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createTokenIssuer(): TokenIssuerPort {
  return {
    issue: testMock().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }),
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
  const verifiers = { verify: testMock() } as unknown as SocialIdentityVerifierPort;

  it('활성 세션의 검증된 액세스 주체를 반환한다', async () => {
    const principal: AuthenticatedPrincipal = {
      userId: 3,
      email: 'mogak@example.test',
      role: 'USER',
      sessionId: SESSION_ID,
    };
    const persistence = createPersistence();
    const tokens = createTokenIssuer();
    jest.mocked(tokens.verifyAccess).mockResolvedValue(principal);
    jest.mocked(persistence.isSessionActive).mockResolvedValue(true);
    const service = new AuthService(verifiers, persistence, tokens);

    await expect(service.authenticateAccessToken('access-token')).resolves.toEqual(principal);
    expect(persistence.isSessionActive).toHaveBeenCalledWith(SESSION_ID, 3);
  });

  it.each(['없는', '비활성', '만료된'])(
    '%s 세션의 액세스 토큰은 로그아웃 토큰 오류로 거부한다',
    async () => {
      const persistence = createPersistence();
      const tokens = createTokenIssuer();
      jest.mocked(tokens.verifyAccess).mockResolvedValue({
        userId: 3,
        role: 'USER',
        sessionId: SESSION_ID,
      });
      jest.mocked(persistence.isSessionActive).mockResolvedValue(false);
      const service = new AuthService(verifiers, persistence, tokens);

      await expect(service.authenticateAccessToken('access-token')).rejects.toEqual(
        new DomainException(AppErrorCode.LOGOUT_TOKEN),
      );
    },
  );

  it('액세스 토큰 검증 실패를 그대로 전파한다', async () => {
    const persistence = createPersistence();
    const tokens = createTokenIssuer();
    const failure = new DomainException(AppErrorCode.WRONG_TOKEN);
    jest.mocked(tokens.verifyAccess).mockRejectedValue(failure);
    const service = new AuthService(verifiers, persistence, tokens);

    await expect(service.authenticateAccessToken('invalid-access-token')).rejects.toBe(failure);
    expect(persistence.isSessionActive).not.toHaveBeenCalled();
  });

  it('요청한 제공자와 다른 검증 식별자를 거부한다', async () => {
    const verifiers = {
      verify: testMock().mockResolvedValue({
        provider: 'KAKAO',
        providerUserId: 'kakao-subject',
        email: null,
        emailVerified: false,
      }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    const service = new AuthService(verifiers, persistence, createTokenIssuer());

    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN),
    );
    expect(persistence.findUserBySocialIdentity).not.toHaveBeenCalled();
  });

  it('검증된 식별자를 직접 계정에 저장한 뒤 대기 사용자 세션을 생성한다', async () => {
    const identity = {
      provider: 'GOOGLE' as const,
      providerUserId: 'google-subject',
      email: 'mogak@example.test',
      emailVerified: true,
    };
    const verifiers = {
      verify: testMock().mockResolvedValue(identity),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    jest.mocked(persistence.createAccount).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: null,
      role: 'PENDING',
    });
    const tokens = createTokenIssuer();
    const service = new AuthService(verifiers, persistence, tokens);

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      isRegistered: false,
      userId: 7,
      tokens: expect.objectContaining({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      }),
    });
    expect(persistence.createAccount).toHaveBeenCalledWith(identity);
    expect(persistence.createSession).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        id: expect.any(String),
        refreshTokenHash: 'refresh-token-hash',
      }),
    );
    const accountCreationCall = jest.mocked(persistence.createAccount).mock.invocationCallOrder[0];
    const sessionCreationCall = jest.mocked(persistence.createSession).mock.invocationCallOrder[0];
    expect(accountCreationCall).toBeDefined();
    expect(sessionCreationCall).toBeDefined();
    if (accountCreationCall === undefined || sessionCreationCall === undefined) {
      throw new Error('expected account and session creation calls');
    }
    expect(accountCreationCall).toBeLessThan(sessionCreationCall);
  });

  it('계정 생성 중 이메일 중복이 발생하면 소셜 계정 연결을 요구한다', async () => {
    const verifiers = {
      verify: testMock().mockResolvedValue({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    jest.mocked(persistence.createAccount).mockRejectedValue(new DuplicateEmailException());
    const service = new AuthService(verifiers, persistence, createTokenIssuer());

    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED),
    );
    expect(persistence.createSession).not.toHaveBeenCalled();
  });

  it('계정 생성 중 소셜 식별자 중복이 발생하면 경쟁 요청의 사용자를 로그인한다', async () => {
    const identity = {
      provider: 'GOOGLE' as const,
      providerUserId: 'google-subject',
      email: 'mogak@example.test',
      emailVerified: true,
    };
    const winner = { id: 7, email: identity.email, nickname: null, role: 'PENDING' as const };
    const verifiers = {
      verify: testMock().mockResolvedValue(identity),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest
      .mocked(persistence.findUserBySocialIdentity)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    jest.mocked(persistence.createAccount).mockRejectedValue(new DuplicateSocialAccountException());
    const service = new AuthService(verifiers, persistence, createTokenIssuer());

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({ userId: winner.id });
    expect(persistence.findUserBySocialIdentity).toHaveBeenCalledTimes(2);
    expect(persistence.createSession).toHaveBeenCalledWith(
      winner.id,
      expect.objectContaining({ refreshTokenHash: 'refresh-token-hash' }),
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
    const service = new AuthService(verifiers, persistence, createTokenIssuer());

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
    jest.mocked(persistence.createAccount).mockResolvedValue({
      id: 7,
      email: null,
      nickname: null,
      role: 'PENDING',
    });
    const service = new AuthService(verifiers, persistence, createTokenIssuer());

    await expect(service.login('KAKAO', 'access-token')).resolves.toMatchObject({ userId: 7 });
    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(AppErrorCode.SOCIAL_EMAIL_NOT_VERIFIED),
    );
  });
});
