import { testMock } from '../../testMock';

import type { Database } from '@infra/database/database.provider';
import {
  CurrentSessionNotActiveException,
  DuplicateNicknameException,
  UserPersistenceException,
} from '@core/users/domain/exception/userPersistence.exception';
import { UserRepository } from '@infra/users/repository/user.repository';

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
      transaction: testMock().mockRejectedValue(duplicate),
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
      transaction: testMock().mockRejectedValue(failure),
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
    const selected = testMock().mockResolvedValue([]);
    const selectWhere = testMock().mockReturnValue({ for: selected });
    const selectFrom = testMock().mockReturnValue({ where: selectWhere });
    const select = testMock().mockReturnValue({ from: selectFrom });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ update, select }),
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

  it('이미 USER로 완료된 동시 가입 요청은 기존 닉네임과 새 세션을 반환한다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const updateWhere = testMock().mockReturnValue({ returning });
    const updateSet = testMock().mockReturnValue({ where: updateWhere });
    const update = testMock().mockReturnValue({ set: updateSet });
    const selected = testMock().mockResolvedValue([
      { id: 7, nickname: '선착순닉네임', role: 'USER' },
    ]);
    const selectWhere = testMock().mockReturnValue({ for: selected });
    const selectFrom = testMock().mockReturnValue({ where: selectWhere });
    const select = testMock().mockReturnValue({ from: selectFrom });
    const insertValues = testMock().mockResolvedValue(undefined);
    const insert = testMock().mockReturnValue({ values: insertValues });
    const deleteReturning = testMock().mockResolvedValue([{ id: 'session-id' }]);
    const deleteWhere = testMock().mockReturnValue({ returning: deleteReturning });
    const remove = testMock().mockReturnValue({ where: deleteWhere });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ update, select, insert, delete: remove }),
    );
    const repository = new UserRepository({ transaction } as unknown as Database);

    await expect(
      repository.completeRegistration({
        ...command,
        nickname: '뒤늦은닉네임',
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
    ).resolves.toEqual({ id: 7, nickname: '선착순닉네임' });
    expect(insertValues).toHaveBeenCalledWith({
      id: 'replacement-session-id',
      userId: 7,
      refreshTokenHash: 'refresh-token-hash',
      expiresAt: command.now,
    });
  });

  it('이미 USER인 동시 가입 요청의 current session이 사라지면 비활성 세션으로 구분한다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const updateWhere = testMock().mockReturnValue({ returning });
    const updateSet = testMock().mockReturnValue({ where: updateWhere });
    const update = testMock().mockReturnValue({ set: updateSet });
    const selected = testMock().mockResolvedValue([
      { id: 7, nickname: '선착순닉네임', role: 'USER' },
    ]);
    const selectWhere = testMock().mockReturnValue({ for: selected });
    const selectFrom = testMock().mockReturnValue({ where: selectWhere });
    const select = testMock().mockReturnValue({ from: selectFrom });
    const deleteReturning = testMock().mockResolvedValue([]);
    const deleteWhere = testMock().mockReturnValue({ returning: deleteReturning });
    const remove = testMock().mockReturnValue({ where: deleteWhere });
    const insert = testMock();
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ update, select, insert, delete: remove }),
    );
    const repository = new UserRepository({ transaction } as unknown as Database);

    await expect(
      repository.completeRegistration({
        ...command,
        nickname: '뒤늦은닉네임',
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
    ).rejects.toBeInstanceOf(CurrentSessionNotActiveException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('current session이 이미 삭제되었으면 replacement session을 생성하지 않는다', async () => {
    const deleteReturning = testMock().mockResolvedValue([]);
    const deleteWhere = testMock().mockReturnValue({ returning: deleteReturning });
    const remove = testMock().mockReturnValue({ where: deleteWhere });
    const insertValues = testMock().mockResolvedValue(undefined);
    const insert = testMock().mockReturnValue({ values: insertValues });
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ insert, delete: remove }),
    );
    const repository = new UserRepository({ transaction } as unknown as Database);

    await expect(
      repository.replaceSession({
        userId: 7,
        currentSessionId: 'session-id',
        replacementSession: {
          id: 'replacement-session-id',
          refreshTokenHash: 'refresh-token-hash',
          expiresAt: command.now,
        },
      }),
    ).rejects.toBeInstanceOf(CurrentSessionNotActiveException);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('지원하지 않는 저장된 역할을 UserPersistenceException으로 거부한다', async () => {
    const findFirst = testMock().mockResolvedValue({ id: 7, role: 'ADMIN' });
    const repository = new UserRepository({
      query: { users: { findFirst } },
    } as unknown as Database);

    await expect(repository.findById(7)).rejects.toBeInstanceOf(UserPersistenceException);
  });
});
