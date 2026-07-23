import { testMock } from '../../../../test/test-mock';
import type { Database } from '../../../database/database.provider';
import { authSessions } from '../../../database/schema';

import { AuthSessionsRepository } from './auth-sessions.repository';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

describe('인증 세션 저장소', () => {
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
