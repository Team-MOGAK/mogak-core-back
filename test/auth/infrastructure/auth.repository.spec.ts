import { testMock } from '../../testMock';
import type { Database } from '../../../apps/api/src/infrastructure/database/database.provider';
import {
  AuthPersistenceException,
  DuplicateEmailException,
  DuplicateSocialAccountException,
} from '../../../apps/api/src/core/auth/domain/exception/authPersistence.exception';
import { AuthRepository } from '../../../apps/api/src/infrastructure/auth/repository/auth.repository';

const identity = {
  provider: 'GOOGLE' as const,
  providerUserId: 'google-subject',
  email: 'mogak@example.test',
  emailVerified: true,
};

describe('인증 저장소', () => {
  it('이메일 고유성 위반을 DuplicateEmailException으로 변환한다', async () => {
    const transaction = testMock().mockRejectedValue({
      code: '23505',
      constraint: 'users_email_unique',
    });
    const repository = new AuthRepository({ transaction } as unknown as Database);

    await expect(repository.createAccount(identity)).rejects.toBeInstanceOf(
      DuplicateEmailException,
    );
  });

  it('소셜 식별자 고유성 위반을 DuplicateSocialAccountException으로 변환한다', async () => {
    const transaction = testMock().mockRejectedValue({
      code: '23505',
      constraint: 'uq_social_account_provider_user',
    });
    const repository = new AuthRepository({ transaction } as unknown as Database);

    await expect(repository.createAccount(identity)).rejects.toBeInstanceOf(
      DuplicateSocialAccountException,
    );
  });

  it('예상하지 못한 데이터베이스 오류를 원인을 보존한 AuthPersistenceException으로 변환한다', async () => {
    const failure = new Error('database unavailable');
    const transaction = testMock().mockRejectedValue(failure);
    const repository = new AuthRepository({ transaction } as unknown as Database);

    await expect(repository.createAccount(identity)).rejects.toEqual(
      expect.objectContaining({
        name: 'AuthPersistenceException',
        cause: failure,
      }),
    );
  });

  it('이미 분류된 AuthPersistenceException을 다시 감싸지 않는다', async () => {
    const failure = new AuthPersistenceException('user insert did not return a row');
    const transaction = testMock().mockRejectedValue(failure);
    const repository = new AuthRepository({ transaction } as unknown as Database);

    await expect(repository.createAccount(identity)).rejects.toBe(failure);
  });

  it('세션 삽입의 예상하지 못한 데이터베이스 오류를 원인을 보존한 AuthPersistenceException으로 변환한다', async () => {
    const failure = new Error('database unavailable');
    const values = testMock().mockRejectedValue(failure);
    const insert = testMock().mockReturnValue({ values });
    const repository = new AuthRepository({ insert } as unknown as Database);

    await expect(
      repository.createSession(7, {
        id: 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f',
        refreshTokenHash: 'refresh-token-hash',
        expiresAt: new Date('2026-08-23T00:00:00.000Z'),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AuthPersistenceException',
        cause: failure,
      }),
    );
  });

  it('세션 삽입 중 발생한 AuthPersistenceException을 다시 감싸지 않는다', async () => {
    const failure = new AuthPersistenceException('session insert invariant failed');
    const values = testMock().mockRejectedValue(failure);
    const insert = testMock().mockReturnValue({ values });
    const repository = new AuthRepository({ insert } as unknown as Database);

    await expect(
      repository.createSession(7, {
        id: 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f',
        refreshTokenHash: 'refresh-token-hash',
        expiresAt: new Date('2026-08-23T00:00:00.000Z'),
      }),
    ).rejects.toBe(failure);
  });

  it('사용자 삽입 결과가 없으면 AuthPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const transaction = testMock().mockImplementation((...args: unknown[]) => {
      const callback = args[0] as (tx: unknown) => unknown;
      return callback({ insert });
    });
    const repository = new AuthRepository({ transaction } as unknown as Database);

    await expect(repository.createAccount(identity)).rejects.toBeInstanceOf(
      AuthPersistenceException,
    );
  });

  it('지원하지 않는 저장된 역할을 AuthPersistenceException으로 거부한다', async () => {
    const findFirst = testMock().mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: null,
      role: 'ADMIN',
    });
    const repository = new AuthRepository({
      query: { users: { findFirst } },
    } as unknown as Database);

    await expect(repository.findUserByEmail('mogak@example.test')).rejects.toBeInstanceOf(
      AuthPersistenceException,
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
