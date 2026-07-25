import { testMock } from '../../test-mock';

import type { Database } from '../../../src/database/database.provider';
import {
  DuplicateNicknameException,
  UserPersistenceException,
} from '../../../src/users/domain/exception/user-persistence.exception';
import { UserRepository } from '../../../src/users/infrastructure/repository/user.repository';

const command = {
  userId: 7,
  nickname: '모각러',
  now: new Date('2026-07-25T00:00:00.000Z'),
};

describe('사용자 저장소', () => {
  it('닉네임 변경의 닉네임 고유성 위반을 DuplicateNicknameException으로 변환한다', async () => {
    const duplicate = Object.assign(new Error('duplicate nickname'), {
      code: '23505',
      constraint: 'users_nickname_unique',
    });
    const repository = new UserRepository({
      update: testMock().mockImplementation(() => {
        throw duplicate;
      }),
    } as unknown as Database);

    await expect(repository.updateNickname(command)).rejects.toBeInstanceOf(
      DuplicateNicknameException,
    );
  });

  it('회원 완료의 닉네임 고유성 위반을 DuplicateNicknameException으로 변환한다', async () => {
    const duplicate = Object.assign(new Error('duplicate nickname'), {
      code: '23505',
      constraint: 'users_nickname_unique',
    });
    const repository = new UserRepository({
      transaction: testMock().mockRejectedValue(duplicate),
    } as unknown as Database);

    await expect(
      repository.completeRegistration({
        ...command,
        jobId: 2,
        addressId: 3,
        consents: [],
        currentSessionId: 'session-id',
        replacementSession: {
          id: 'replacement-session-id',
          refreshTokenHash: 'refresh-token-hash',
          expiresAt: command.now,
        },
      }),
    ).rejects.toBeInstanceOf(DuplicateNicknameException);
  });

  it('회원 완료의 예상하지 못한 데이터베이스 오류를 원인을 보존한 UserPersistenceException으로 변환한다', async () => {
    const failure = new Error('database unavailable');
    const repository = new UserRepository({
      transaction: testMock().mockRejectedValue(failure),
    } as unknown as Database);

    await expect(
      repository.completeRegistration({
        ...command,
        jobId: 2,
        addressId: 3,
        consents: [],
        currentSessionId: 'session-id',
        replacementSession: {
          id: 'replacement-session-id',
          refreshTokenHash: 'refresh-token-hash',
          expiresAt: command.now,
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'UserPersistenceException',
        cause: failure,
      }),
    );
  });

  it('예상하지 못한 데이터베이스 오류를 원인을 보존한 UserPersistenceException으로 변환한다', async () => {
    const failure = new Error('database unavailable');
    const repository = new UserRepository({
      update: testMock().mockImplementation(() => {
        throw failure;
      }),
    } as unknown as Database);

    await expect(repository.updateNickname(command)).rejects.toEqual(
      expect.objectContaining({
        name: 'UserPersistenceException',
        cause: failure,
      }),
    );
  });

  it('회원 완료 갱신 결과가 없으면 UserPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const where = testMock().mockReturnValue({ returning });
    const set = testMock().mockReturnValue({ where });
    const update = testMock().mockReturnValue({ set });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ update }),
    );
    const repository = new UserRepository({ transaction } as unknown as Database);

    await expect(
      repository.completeRegistration({
        ...command,
        jobId: 2,
        addressId: 3,
        consents: [],
        currentSessionId: 'session-id',
        replacementSession: {
          id: 'replacement-session-id',
          refreshTokenHash: 'refresh-token-hash',
          expiresAt: command.now,
        },
      }),
    ).rejects.toBeInstanceOf(UserPersistenceException);
  });

  it('지원하지 않는 저장된 역할을 UserPersistenceException으로 거부한다', async () => {
    const findFirst = testMock().mockResolvedValue({ id: 7, role: 'ADMIN' });
    const repository = new UserRepository({
      query: { users: { findFirst } },
    } as unknown as Database);

    await expect(repository.findById(7)).rejects.toBeInstanceOf(UserPersistenceException);
  });
});
