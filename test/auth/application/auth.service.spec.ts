import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { jest } from '@jest/globals';
import { testMock } from '../../testMock';
import type { AuthPersistencePort } from '@core/auth/application/port/authPersistence.port';
import type { AuthTokenVerifierPort } from '@core/auth/application/port/authTokenVerifier.port';
import type { SessionTokenIssuerPort } from '@core/auth/application/port/sessionTokenIssuer.port';
import type { SocialIdentityVerifierPort } from '@core/auth/application/port/socialIdentityVerifier.port';
import { AuthService } from '@core/auth/application/service/auth.service';
import type { AuthenticatedPrincipal } from '@core/auth/application/type/authenticatedPrincipal';
import {
  DuplicateEmailException,
  DuplicateSocialAccountException,
} from '@core/auth/domain/exception/authPersistence.exception';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createTokenPorts(): SessionTokenIssuerPort & AuthTokenVerifierPort {
  return {
    issue: testMock().mockResolvedValue({
      accessToken: 'accessToken',
      refreshToken: 'refresh-token',
      refreshTokenHash: 'refresh-token-hash',
      refreshTokenExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
    }),
    verifyAccess: testMock(),
    verifyRefresh: testMock(),
  };
}

function createPersistence(): AuthPersistencePort {
  return {
    findUserById: testMock(),
    findUserByEmail: testMock(),
    findUserBySocialIdentity: testMock(),
    findRegistrationSnapshot: testMock(),
    normalizeNullRole: testMock(),
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

  it('세션 생성 중 잠금 후 사용자가 사라지면 USER_NOT_FOUND로 변환한다', async () => {
    const sessionVerifiers = {
      verify: testMock().mockResolvedValue({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: null,
      role: 'PENDING',
    });
    jest
      .mocked(persistence.createSession)
      .mockRejectedValue(new DomainException(DomainErrorCode.USER_NOT_FOUND));
    const tokens = createTokenPorts();
    const service = new AuthService(sessionVerifiers, persistence, tokens, tokens);

    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(DomainErrorCode.USER_NOT_FOUND),
    );
  });

  it('활성 세션의 검증된 액세스 주체를 반환한다', async () => {
    const principal: AuthenticatedPrincipal = {
      userId: 3,
      email: 'mogak@example.test',
      role: 'USER',
      sessionId: SESSION_ID,
    };
    const persistence = createPersistence();
    const tokens = createTokenPorts();
    jest.mocked(tokens.verifyAccess).mockResolvedValue(principal);
    jest.mocked(persistence.isSessionActive).mockResolvedValue(true);
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.authenticateAccessToken('accessToken')).resolves.toEqual(principal);
    expect(persistence.isSessionActive).toHaveBeenCalledWith(SESSION_ID, 3);
  });

  it.each(['없는', '비활성', '만료된'])(
    '%s 세션의 액세스 토큰은 로그아웃 토큰 오류로 거부한다',
    async () => {
      const persistence = createPersistence();
      const tokens = createTokenPorts();
      jest.mocked(tokens.verifyAccess).mockResolvedValue({
        userId: 3,
        role: 'USER',
        sessionId: SESSION_ID,
      });
      jest.mocked(persistence.isSessionActive).mockResolvedValue(false);
      const service = new AuthService(verifiers, persistence, tokens, tokens);

      await expect(service.authenticateAccessToken('accessToken')).rejects.toEqual(
        new DomainException(DomainErrorCode.LOGOUT_TOKEN),
      );
    },
  );

  it('액세스 토큰 검증 실패를 그대로 전파한다', async () => {
    const persistence = createPersistence();
    const tokens = createTokenPorts();
    const failure = new DomainException(DomainErrorCode.WRONG_TOKEN);
    jest.mocked(tokens.verifyAccess).mockRejectedValue(failure);
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.authenticateAccessToken('invalid-accessToken')).rejects.toBe(failure);
    expect(persistence.isSessionActive).not.toHaveBeenCalled();
  });

  it('검증한 리프레시 토큰의 해시와 새 세션 토큰의 만료 시각으로 세션을 회전한다', async () => {
    const persistence = createPersistence();
    const tokens = createTokenPorts();
    jest.mocked(tokens.verifyRefresh).mockResolvedValue({
      userId: 3,
      sessionId: SESSION_ID,
      refreshTokenHash: 'current-refresh-token-hash',
    });
    jest.mocked(persistence.findUserById).mockResolvedValue({
      id: 3,
      email: 'mogak@example.test',
      nickname: '모각러',
      role: 'USER',
    });
    jest.mocked(persistence.rotateSession).mockResolvedValue(true);
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.refresh('current-refresh-token')).resolves.toEqual({
      accessToken: 'accessToken',
      refreshToken: 'refresh-token',
    });
    expect(persistence.rotateSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      currentRefreshTokenHash: 'current-refresh-token-hash',
      nextRefreshTokenHash: 'refresh-token-hash',
      nextExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
      now: expect.any(Date),
    });
  });

  it('세션 회전의 compare-and-set이 실패하면 토큰을 발급하지 않는다', async () => {
    const persistence = createPersistence();
    const tokens = createTokenPorts();
    jest.mocked(tokens.verifyRefresh).mockResolvedValue({
      userId: 3,
      sessionId: SESSION_ID,
      refreshTokenHash: 'current-refresh-token-hash',
    });
    jest.mocked(persistence.findUserById).mockResolvedValue({
      id: 3,
      email: 'mogak@example.test',
      nickname: '모각러',
      role: 'USER',
    });
    jest.mocked(persistence.rotateSession).mockResolvedValue(false);
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.refresh('current-refresh-token')).rejects.toEqual(
      new DomainException(DomainErrorCode.WRONG_TOKEN),
    );
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
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN),
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
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      flow: 'NEW',
      result: {
        isRegistered: false,
        userId: 7,
        tokens: expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        }),
      },
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

  it('계정 생성 중 이메일 중복 후 같은 소셜 식별자가 확인되면 가입을 재개한다', async () => {
    const verifiers = {
      verify: testMock().mockResolvedValue({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierPort;
    const persistence = createPersistence();
    jest
      .mocked(persistence.findUserBySocialIdentity)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 7,
        email: 'mogak@example.test',
        nickname: null,
        role: 'PENDING',
      });
    jest.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    jest.mocked(persistence.createAccount).mockRejectedValue(new DuplicateEmailException());
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      flow: 'RESUME',
      result: { userId: 7, isRegistered: false },
    });
    expect(persistence.createSession).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ refreshTokenHash: 'refresh-token-hash' }),
    );
  });

  it('계정 생성 중 이메일 중복 뒤 exact identity를 찾지 못하면 U012로 거부하고 세션을 만들지 않는다', async () => {
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
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(DomainErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED),
    );
    expect(persistence.findUserBySocialIdentity).toHaveBeenCalledTimes(2);
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
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      flow: 'RESUME',
      result: { userId: winner.id, isRegistered: false },
    });
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
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('KAKAO', 'accessToken')).rejects.toEqual(
      new DomainException(DomainErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED),
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
    const tokens = createTokenPorts();
    const service = new AuthService(verifiers, persistence, tokens, tokens);

    await expect(service.login('KAKAO', 'accessToken')).resolves.toMatchObject({
      flow: 'NEW',
      result: { userId: 7 },
    });
    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new DomainException(DomainErrorCode.SOCIAL_EMAIL_NOT_VERIFIED),
    );
  });

  it('기존 PENDING 사용자는 가입 재개 코드를 받고 새 세션을 발급받는다', async () => {
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: null,
      role: 'PENDING',
    });
    const tokens = createTokenPorts();
    const service = new AuthService(
      {
        verify: testMock().mockResolvedValue({
          provider: 'GOOGLE',
          providerUserId: 'google-subject',
          email: 'mogak@example.test',
          emailVerified: true,
        }),
      } as unknown as SocialIdentityVerifierPort,
      persistence,
      tokens,
      tokens,
    );

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      flow: 'RESUME',
      result: { isRegistered: false, userId: 7 },
    });
  });

  it('null role의 필수 가입 정보와 필수 동의가 모두 충족되면 USER로 정규화한다', async () => {
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: '모각이',
      role: null,
    });
    jest.mocked(persistence.findRegistrationSnapshot).mockResolvedValue({
      nickname: '모각이',
      jobId: 2,
      addressId: 3,
      requiredConsentAgreements: [true],
    });
    jest.mocked(persistence.normalizeNullRole).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: '모각이',
      role: 'USER',
    });
    const tokens = createTokenPorts();
    const service = new AuthService(
      {
        verify: testMock().mockResolvedValue({
          provider: 'GOOGLE',
          providerUserId: 'google-subject',
          email: 'mogak@example.test',
          emailVerified: true,
        }),
      } as unknown as SocialIdentityVerifierPort,
      persistence,
      tokens,
      tokens,
    );

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      flow: 'REGISTERED',
      result: { isRegistered: true, userId: 7 },
    });
    expect(persistence.normalizeNullRole).toHaveBeenCalledWith(7, 'USER');
  });

  it('null role의 필수 가입 정보가 하나라도 비어 있으면 PENDING으로 정규화해 가입을 재개한다', async () => {
    const persistence = createPersistence();
    jest.mocked(persistence.findUserBySocialIdentity).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: '모각이',
      role: null,
    });
    jest.mocked(persistence.findRegistrationSnapshot).mockResolvedValue({
      nickname: '모각이',
      jobId: 2,
      addressId: null,
      requiredConsentAgreements: [true],
    });
    jest.mocked(persistence.normalizeNullRole).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: '모각이',
      role: 'PENDING',
    });
    const tokens = createTokenPorts();
    const service = new AuthService(
      {
        verify: testMock().mockResolvedValue({
          provider: 'GOOGLE',
          providerUserId: 'google-subject',
          email: 'mogak@example.test',
          emailVerified: true,
        }),
      } as unknown as SocialIdentityVerifierPort,
      persistence,
      tokens,
      tokens,
    );

    await expect(service.login('GOOGLE', 'id-token')).resolves.toMatchObject({
      flow: 'RESUME',
      result: { isRegistered: false, userId: 7 },
    });
    expect(persistence.normalizeNullRole).toHaveBeenCalledWith(7, 'PENDING');
  });
});
