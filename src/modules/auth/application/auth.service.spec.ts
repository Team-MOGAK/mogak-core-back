import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AppEnv } from '../../../config/app-env';
import type { AuthPersistence } from '../domain/auth-persistence.port';
import { AuthService } from './auth.service';
import type { SocialIdentityVerifierRegistry } from '../infrastructure/social-identity-verifier.registry';
import { TokenService } from '../infrastructure/token.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createTokenService(): TokenService {
  const config = {
    getOrThrow: vi.fn().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService<AppEnv, true>;
  return new TokenService(config);
}

function createPersistence(): AuthPersistence {
  return {
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserBySocialIdentity: vi.fn(),
    createAccount: vi.fn(),
    createSession: vi.fn(),
    rotateSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteUser: vi.fn(),
  };
}

describe('AuthService', () => {
  it('creates a PENDING user and session for a new verified Google identity', async () => {
    const verifiers = {
      verify: vi.fn().mockResolvedValue({
        provider: 'GOOGLE',
        providerUserId: 'google-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierRegistry;
    const persistence = createPersistence();
    vi.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    vi.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    vi.mocked(persistence.createAccount).mockImplementation(
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
    const service = new AuthService(verifiers, persistence, createTokenService(), () => SESSION_ID);

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

  it('does not link a new identity merely because its email belongs to another user', async () => {
    const verifiers = {
      verify: vi.fn().mockResolvedValue({
        provider: 'KAKAO',
        providerUserId: 'kakao-subject',
        email: 'mogak@example.test',
        emailVerified: true,
      }),
    } as unknown as SocialIdentityVerifierRegistry;
    const persistence = createPersistence();
    vi.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    vi.mocked(persistence.findUserByEmail).mockResolvedValue({
      id: 3,
      email: 'mogak@example.test',
      nickname: '기존사용자',
      role: 'USER',
    });
    const service = new AuthService(verifiers, persistence, createTokenService(), () => SESSION_ID);

    await expect(service.login('KAKAO', 'access-token')).rejects.toEqual(
      new AppException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED),
    );
    expect(persistence.createAccount).not.toHaveBeenCalled();
  });

  it('allows a Kakao identity with no email but rejects an unverified Google email', async () => {
    const verifiers = {
      verify: vi
        .fn()
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
    } as unknown as SocialIdentityVerifierRegistry;
    const persistence = createPersistence();
    vi.mocked(persistence.findUserBySocialIdentity).mockResolvedValue(null);
    vi.mocked(persistence.findUserByEmail).mockResolvedValue(null);
    vi.mocked(persistence.createAccount).mockImplementation(
      async (_input, createSession) =>
        (await createSession({ id: 7, email: null, nickname: null, role: 'PENDING' })).result,
    );
    const service = new AuthService(verifiers, persistence, createTokenService(), () => SESSION_ID);

    await expect(service.login('KAKAO', 'access-token')).resolves.toMatchObject({ userId: 7 });
    await expect(service.login('GOOGLE', 'id-token')).rejects.toEqual(
      new AppException(AppErrorCode.SOCIAL_EMAIL_NOT_VERIFIED),
    );
  });
});
