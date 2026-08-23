import { testMock } from '../../testMock';
import type { Database } from '@infra/database/database.provider';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import {
  AuthPersistenceException,
  DuplicateEmailException,
  DuplicateSocialAccountException,
} from '@core/auth/domain/exception/authPersistence.exception';
import { AuthRepository } from '@infra/auth/repository/auth.repository';

const identity = {
  provider: 'GOOGLE' as const,
  providerUserId: 'google-subject',
  email: 'mogak@example.test',
  emailVerified: true,
};

describe('인증 저장소', () => {
  it('잠금 뒤 사용자가 없으면 세션을 삽입하지 않고 전용 예외를 던진다', async () => {
    const execute = testMock().mockResolvedValue(undefined);
    const where = testMock().mockResolvedValue([]);
    const from = testMock().mockReturnValue({ where });
    const select = testMock().mockReturnValue({ from });
    const insert = testMock();
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute, select, insert }),
    );
    const repository = new AuthRepository({ transaction } as unknown as Database);

    await expect(
      repository.createSession(7, {
        id: 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f',
        refreshTokenHash: 'refresh-token-hash',
        expiresAt: new Date('2026-08-23T00:00:00.000Z'),
      }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.USER_NOT_FOUND));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

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

  it('기존 migration의 소셜 식별자 고유성 위반도 DuplicateSocialAccountException으로 변환한다', async () => {
    const transaction = testMock().mockRejectedValue({
      code: '23505',
      constraint: 'social_accounts_provider_user_unique',
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
    const where = testMock().mockResolvedValue([{ id: 7 }]);
    const from = testMock().mockReturnValue({ where });
    const select = testMock().mockReturnValue({ from });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute: testMock(), select, insert }),
    );
    const repository = new AuthRepository({ transaction } as unknown as Database);

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
    const where = testMock().mockResolvedValue([{ id: 7 }]);
    const from = testMock().mockReturnValue({ where });
    const select = testMock().mockReturnValue({ from });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute: testMock(), select, insert }),
    );
    const repository = new AuthRepository({ transaction } as unknown as Database);

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

  it('null role 정규화에 필요한 가입 정보와 활성 필수 동의 snapshot을 조회한다', async () => {
    const findFirst = testMock().mockResolvedValue({
      id: 7,
      email: 'mogak@example.test',
      nickname: '모각이',
      jobId: 2,
      addressId: 3,
      role: null,
    });
    const requiredConsents = testMock().mockResolvedValue([{ agreed: true }, { agreed: true }]);
    const select = testMock().mockReturnValue({
      from: testMock().mockReturnValue({
        leftJoin: testMock().mockReturnValue({ where: requiredConsents }),
      }),
    });
    const repository = new AuthRepository({
      query: { users: { findFirst } },
      select,
    } as unknown as Database);

    await expect(repository.findRegistrationSnapshot(7)).resolves.toEqual({
      nickname: '모각이',
      jobId: 2,
      addressId: 3,
      requiredConsentAgreements: [true, true],
    });
  });

  it('null role을 전달된 역할로 user_id 및 role IS NULL 조건에서만 갱신한다', async () => {
    const selected = testMock().mockResolvedValue([
      {
        id: 7,
        email: 'mogak@example.test',
        nickname: '모각이',
        role: 'USER',
      },
    ]);
    const where = testMock().mockResolvedValue([]);
    const set = testMock().mockReturnValue({ where });
    const select = testMock().mockReturnValue({
      from: testMock().mockReturnValue({ where: selected }),
    });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute: testMock(), update: testMock().mockReturnValue({ set }), select }),
    );
    const repository = new AuthRepository({
      transaction,
    } as unknown as Database);

    await expect(repository.normalizeNullRole(7, 'USER')).resolves.toMatchObject({ role: 'USER' });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ role: 'USER' }));
    const predicate = where.mock.calls[0]?.[0];
    if (predicate === undefined) throw new Error('expected null-role CAS predicate');
    const query = new PgDialect().sqlToQuery(predicate as SQL);
    expect(query.sql).toContain('"users"."user_id" = $1');
    expect(query.sql).toContain('"users"."role" is null');
    expect(query.params).toEqual([7]);
  });
});
