import { testMock } from '../../testMock';
import type { Database } from '@infra/database/database.provider';
import { authSessions } from '@infra/database/schema';

import { AuthSessionsRepository } from '@infra/auth/repository/authSessions.repository';
import { AuthPersistenceException } from '@core/auth/domain/exception/authPersistence.exception';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

describe('인증 세션 저장소', () => {
  it('세션 삽입 결과가 없으면 AuthPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const repository = new AuthSessionsRepository({ insert } as unknown as Database);

    await expect(
      repository.create({
        id: SESSION_ID,
        userId: 7,
        refreshTokenHash: 'refresh-token-hash',
        expiresAt: new Date('2026-08-23T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(AuthPersistenceException);

    expect(insert).toHaveBeenCalledWith(authSessions);
  });

  it('세션 삽입의 예상하지 못한 데이터베이스 오류를 원인을 보존한 AuthPersistenceException으로 변환한다', async () => {
    const failure = new Error('database unavailable');
    const values = testMock().mockReturnValue({
      returning: testMock().mockRejectedValue(failure),
    });
    const insert = testMock().mockReturnValue({ values });
    const repository = new AuthSessionsRepository({ insert } as unknown as Database);

    await expect(
      repository.create({
        id: SESSION_ID,
        userId: 7,
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
    const values = testMock().mockReturnValue({
      returning: testMock().mockRejectedValue(failure),
    });
    const insert = testMock().mockReturnValue({ values });
    const repository = new AuthSessionsRepository({ insert } as unknown as Database);

    await expect(
      repository.create({
        id: SESSION_ID,
        userId: 7,
        refreshTokenHash: 'refresh-token-hash',
        expiresAt: new Date('2026-08-23T00:00:00.000Z'),
      }),
    ).rejects.toBe(failure);
  });

  it('비교 후 교체 방식의 리프레시 갱신이 세션 하나를 수정할 때만 true를 반환한다', async () => {
    const returning = testMock().mockResolvedValue([{ id: SESSION_ID }]);
    const where = testMock().mockReturnValue({ returning });
    const set = testMock().mockReturnValue({ where });
    const update = testMock().mockReturnValue({ set });
    const repository = new AuthSessionsRepository({ update } as unknown as Database);

    await expect(
      repository.rotate({
        sessionId: SESSION_ID,
        currentRefreshTokenHash: 'current-hash',
        nextRefreshTokenHash: 'next-hash',
        nextExpiresAt: new Date('2026-08-23T00:00:00.000Z'),
        now: new Date('2026-07-23T00:00:00.000Z'),
      }),
    ).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith(authSessions);
    expect(set).toHaveBeenCalledWith({
      refreshTokenHash: 'next-hash',
      expiresAt: new Date('2026-08-23T00:00:00.000Z'),
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('리프레시 토큰을 이미 사용했거나 세션이 만료되면 false를 반환한다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const where = testMock().mockReturnValue({ returning });
    const set = testMock().mockReturnValue({ where });
    const update = testMock().mockReturnValue({ set });
    const repository = new AuthSessionsRepository({ update } as unknown as Database);

    await expect(
      repository.rotate({
        sessionId: SESSION_ID,
        currentRefreshTokenHash: 'current-hash',
        nextRefreshTokenHash: 'next-hash',
        nextExpiresAt: new Date('2026-08-23T00:00:00.000Z'),
        now: new Date('2026-07-23T00:00:00.000Z'),
      }),
    ).resolves.toBe(false);
  });
});
