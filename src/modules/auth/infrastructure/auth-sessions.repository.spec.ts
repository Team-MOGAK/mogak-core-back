import type { Database } from '../../../database/database.provider';
import { authSessions } from '../../../database/schema';
import { describe, expect, it, vi } from 'vitest';

import { AuthSessionsRepository } from './auth-sessions.repository';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

describe('AuthSessionsRepository', () => {
  it('returns true only when one compare-and-swap refresh rotation updates a session', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: SESSION_ID }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
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
    expect(where).toHaveBeenCalledOnce();
  });

  it('returns false when a refresh token was already used or the session expired', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
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
