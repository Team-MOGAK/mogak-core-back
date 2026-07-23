import { jest } from '@jest/globals';
import { testMock } from '../../../../test/test-mock';
import type { ConfigService } from '@nestjs/config';

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
    getOrThrow: testMock().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService<AppEnv, true>;
  return new TokenService(config);
}

function userRepository(): UserRepository {
  return {
    existsByNickname: testMock(),
    findById: testMock(),
    findJobByName: testMock(),
    findAddressByName: testMock(),
    completeRegistration: testMock(),
    findProfile: testMock(),
    updateNickname: testMock(),
    updateJob: testMock(),
  } as unknown as UserRepository;
}

function consentRepository(): ConsentRepository {
  return {
    listActiveItems: testMock(),
    findItemsByIds: testMock(),
    upsertUserConsents: testMock(),
    getMarketingConsents: testMock(),
    updateMarketingConsents: testMock(),
  } as unknown as ConsentRepository;
}

function storage(): StoragePort {
  return {
    uploadProfile: testMock(),
    uploadPostImages: testMock(),
    replaceProfile: testMock(),
    deleteProfile: testMock(),
    resolvePublicUrl: testMock(),
  };
}

describe('사용자 서비스', () => {
  it('이미 사용 중인 닉네임을 거부한다', async () => {
    const users = userRepository();
    jest.mocked(users.existsByNickname).mockResolvedValue(true);
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

  it('대기 사용자를 완료하고 동의 상태를 저장한 뒤 세션을 사용자 토큰으로 교체한다', async () => {
    const users = userRepository();
    const consents = consentRepository();
    jest.mocked(users.findById).mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: null,
      role: 'PENDING',
    });
    jest.mocked(users.findJobByName).mockResolvedValue({ id: 2, name: '개발/데이터' });
    jest.mocked(users.findAddressByName).mockResolvedValue({ id: 3, name: '서울특별시' });
    jest
      .mocked(consents.listActiveItems)
      .mockResolvedValue([{ id: 1, code: 'MARKETING', required: false, active: true }]);
    jest
      .mocked(consents.findItemsByIds)
      .mockResolvedValue([{ id: 1, code: 'MARKETING', required: false, active: true }]);
    jest.mocked(users.completeRegistration).mockResolvedValue({
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
