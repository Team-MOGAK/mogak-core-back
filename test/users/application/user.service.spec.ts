import { jest } from '@jest/globals';
import { testMock } from '../../test-mock';

import type { TokenIssuerPort } from '../../../src/auth/application/port/token-issuer.port';
import type { AuthenticatedPrincipal } from '../../../src/auth/application/type/authenticated-principal';
import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import type { StoragePort } from '../../../src/storage/application/storage.port';
import type { ConsentRepositoryPort } from '../../../src/users/application/port/consent.repository.port';
import type { MetadataRepositoryPort } from '../../../src/users/application/port/metadata.repository.port';
import type { UserRepositoryPort } from '../../../src/users/application/port/user.repository.port';
import { ConsentService } from '../../../src/users/application/service/consent.service';
import { UserService } from '../../../src/users/application/service/user.service';
import { DuplicateNicknameException } from '../../../src/users/domain/exception/user-persistence.exception';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';
const now = new Date('2026-07-25T00:00:00.000Z');

function currentPendingUser(): AuthenticatedPrincipal {
  return { userId: 7, role: 'PENDING', sessionId: SESSION_ID };
}

function tokenIssuer(): TokenIssuerPort {
  return {
    issue: testMock().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    verifyAccess: testMock(),
    verifyRefresh: testMock(),
    hashRefreshToken: testMock().mockReturnValue('refresh-hash'),
  } as unknown as TokenIssuerPort;
}

function userRepository(): UserRepositoryPort {
  return {
    existsByNickname: testMock(),
    findById: testMock(),
    findProfile: testMock(),
    completeRegistration: testMock(),
    updateNickname: testMock(),
    updateJob: testMock(),
    updateProfileImageKey: testMock(),
  } as unknown as UserRepositoryPort;
}

function metadataRepository(): MetadataRepositoryPort {
  return {
    listJobs: testMock(),
    listAddresses: testMock(),
    findJobByName: testMock(),
    findAddressByName: testMock(),
  } as unknown as MetadataRepositoryPort;
}

function consentRepository(): ConsentRepositoryPort {
  return {
    listActiveItems: testMock(),
    findItemsByIds: testMock(),
    upsertUserConsents: testMock(),
    getMarketingConsents: testMock(),
    updateMarketingConsents: testMock(),
  } as unknown as ConsentRepositoryPort;
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
  it('공백뿐인 닉네임을 조회 전에 거부한다', async () => {
    const users = userRepository();
    const service = new UserService(
      users,
      metadataRepository(),
      new ConsentService(consentRepository()),
      tokenIssuer(),
      storage(),
    );

    await expect(service.verifyNickname('   ')).rejects.toEqual(
      new DomainException(AppErrorCode.INVALID_PARAMETER),
    );
    expect(users.existsByNickname).not.toHaveBeenCalled();
  });

  it('이미 사용 중인 닉네임을 거부한다', async () => {
    const users = userRepository();
    jest.mocked(users.existsByNickname).mockResolvedValue(true);
    const service = new UserService(
      users,
      metadataRepository(),
      new ConsentService(consentRepository()),
      tokenIssuer(),
      storage(),
    );

    await expect(service.verifyNickname('모각러')).rejects.toEqual(
      new DomainException(AppErrorCode.INVALID_NICKNAME),
    );
  });

  it('저장소가 중복 닉네임을 보고하면 닉네임 변경을 거부한다', async () => {
    const users = userRepository();
    jest.mocked(users.existsByNickname).mockResolvedValue(false);
    jest.mocked(users.updateNickname).mockRejectedValue(new DuplicateNicknameException());
    const service = new UserService(
      users,
      metadataRepository(),
      new ConsentService(consentRepository()),
      tokenIssuer(),
      storage(),
    );

    await expect(service.updateNickname(7, '모각러')).rejects.toEqual(
      new DomainException(AppErrorCode.INVALID_NICKNAME),
    );
  });

  it('저장소의 원시 데이터베이스 오류를 닉네임 오류로 변환하지 않는다', async () => {
    const users = userRepository();
    const failure = Object.assign(new Error('duplicate nickname'), {
      code: '23505',
      constraint: 'users_nickname_unique',
    });
    jest.mocked(users.existsByNickname).mockResolvedValue(false);
    jest.mocked(users.updateNickname).mockRejectedValue(failure);
    const service = new UserService(
      users,
      metadataRepository(),
      new ConsentService(consentRepository()),
      tokenIssuer(),
      storage(),
    );

    await expect(service.updateNickname(7, '모각러')).rejects.toBe(failure);
  });

  it('저장소가 중복 닉네임을 보고하면 가입을 거부한다', async () => {
    const users = userRepository();
    const metadata = metadataRepository();
    const consents = consentRepository();
    jest.mocked(users.findById).mockResolvedValue({
      id: 7,
      jobId: null,
      addressId: null,
      email: 'mogak@example.test',
      nickname: null,
      gender: null,
      age: null,
      role: 'PENDING',
      profileImageKey: null,
      createdAt: now,
      updatedAt: now,
    });
    jest.mocked(users.existsByNickname).mockResolvedValue(false);
    jest.mocked(metadata.findJobByName).mockResolvedValue({ id: 2, name: '개발/데이터' });
    jest.mocked(metadata.findAddressByName).mockResolvedValue({ id: 3, name: '서울특별시' });
    jest.mocked(consents.listActiveItems).mockResolvedValue([]);
    jest.mocked(consents.findItemsByIds).mockResolvedValue([]);
    jest.mocked(users.completeRegistration).mockRejectedValue(new DuplicateNicknameException());
    const service = new UserService(
      users,
      metadata,
      new ConsentService(consents),
      tokenIssuer(),
      storage(),
    );

    await expect(
      service.join(currentPendingUser(), {
        nickname: '모각러',
        job: '개발/데이터',
        address: '서울특별시',
        consents: [],
      }),
    ).rejects.toEqual(new DomainException(AppErrorCode.INVALID_NICKNAME));
  });

  it('대기 사용자를 완료하고 동의 상태를 저장한 뒤 세션을 사용자 토큰으로 교체한다', async () => {
    const users = userRepository();
    const metadata = metadataRepository();
    const consents = consentRepository();
    jest.mocked(users.findById).mockResolvedValue({
      id: 7,
      jobId: null,
      addressId: null,
      email: 'mogak@example.test',
      nickname: null,
      gender: null,
      age: null,
      role: 'PENDING',
      profileImageKey: null,
      createdAt: now,
      updatedAt: now,
    });
    jest.mocked(metadata.findJobByName).mockResolvedValue({ id: 2, name: '개발/데이터' });
    jest.mocked(metadata.findAddressByName).mockResolvedValue({ id: 3, name: '서울특별시' });
    jest.mocked(consents.listActiveItems).mockResolvedValue([
      {
        id: 1,
        code: 'MARKETING',
        name: '마케팅',
        description: null,
        required: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    jest.mocked(consents.findItemsByIds).mockResolvedValue([
      {
        id: 1,
        code: 'MARKETING',
        name: '마케팅',
        description: null,
        required: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    jest.mocked(users.completeRegistration).mockResolvedValue({ id: 7, nickname: '모각러' });
    const service = new UserService(
      users,
      metadata,
      new ConsentService(consents),
      tokenIssuer(),
      storage(),
    );

    await expect(
      service.join(currentPendingUser(), {
        nickname: '모각러',
        job: '개발/데이터',
        address: '서울특별시',
        consents: [{ consentItemId: 1, agreed: true }],
      }),
    ).resolves.toEqual({
      userId: 7,
      nickname: '모각러',
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    });
    expect(users.completeRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        nickname: '모각러',
        jobId: 2,
        addressId: 3,
        currentSessionId: SESSION_ID,
        replacementSession: expect.objectContaining({ id: expect.any(String) }),
      }),
    );
  });
});
