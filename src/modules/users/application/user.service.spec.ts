import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AppEnv } from '../../../config/app-env';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { TokenService } from '../../auth/infrastructure/token.service';
import type { StoragePort } from '../../storage/application/storage.port';
import type { ConsentRepository } from '../infrastructure/consent.repository';
import type { UserRepository } from '../infrastructure/user.repository';
import { ConsentService } from './consent.service';
import { UserService } from './user.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function currentPendingUser(): AuthenticatedUser {
  return { userId: 7, role: 'PENDING', sessionId: SESSION_ID };
}

function tokenService(): TokenService {
  const config = {
    getOrThrow: vi.fn().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService<AppEnv, true>;
  return new TokenService(config);
}

function userRepository(): UserRepository {
  return {
    existsByNickname: vi.fn(),
    findById: vi.fn(),
    findJobByName: vi.fn(),
    findAddressByName: vi.fn(),
    completeRegistration: vi.fn(),
    findProfile: vi.fn(),
    updateNickname: vi.fn(),
    updateJob: vi.fn(),
  } as unknown as UserRepository;
}

function consentRepository(): ConsentRepository {
  return {
    listActiveItems: vi.fn(),
    findItemsByIds: vi.fn(),
    upsertUserConsents: vi.fn(),
    getMarketingConsents: vi.fn(),
    updateMarketingConsents: vi.fn(),
  } as unknown as ConsentRepository;
}

function storage(): StoragePort {
  return {
    uploadProfile: vi.fn(),
    replaceProfile: vi.fn(),
    deleteProfile: vi.fn(),
    resolvePublicUrl: vi.fn(),
  };
}

describe('UserService', () => {
  it('rejects an already used nickname', async () => {
    const users = userRepository();
    vi.mocked(users.existsByNickname).mockResolvedValue(true);
    const service = new UserService(
      users,
      new ConsentService(consentRepository()),
      tokenService(),
      storage(),
      () => SESSION_ID,
    );

    await expect(service.verifyNickname('모각러')).rejects.toEqual(
      new AppException(AppErrorCode.INVALID_NICKNAME),
    );
  });

  it('completes a pending user, writes consent state, and replaces its session with USER tokens', async () => {
    const users = userRepository();
    const consents = consentRepository();
    vi.mocked(users.findById).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: null,
      role: 'PENDING',
    });
    vi.mocked(users.findJobByName).mockResolvedValue({ id: 2, name: '개발/데이터' });
    vi.mocked(users.findAddressByName).mockResolvedValue({ id: 3, name: '서울특별시' });
    vi.mocked(consents.listActiveItems).mockResolvedValue([
      { id: 1, code: 'MARKETING', required: false, active: true },
    ]);
    vi.mocked(consents.findItemsByIds).mockResolvedValue([
      { id: 1, code: 'MARKETING', required: false, active: true },
    ]);
    vi.mocked(users.completeRegistration).mockResolvedValue({
      id: 7,
      nickname: '모각러',
    });
    const service = new UserService(
      users,
      new ConsentService(consents),
      tokenService(),
      storage(),
      () => SESSION_ID,
    );

    await expect(
      service.join(currentPendingUser(), {
        nickname: '모각러',
        job: '개발/데이터',
        address: '서울특별시',
        consents: [{ consentItemId: 1, agreed: true }],
      }),
    ).resolves.toMatchObject({
      userId: 7,
      nickname: '모각러',
      tokens: { accessToken: expect.any(String), refreshToken: expect.any(String) },
    });
    expect(users.completeRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        nickname: '모각러',
        jobId: 2,
        addressId: 3,
        currentSessionId: SESSION_ID,
        replacementSession: expect.objectContaining({ id: SESSION_ID }),
      }),
    );
  });
});
