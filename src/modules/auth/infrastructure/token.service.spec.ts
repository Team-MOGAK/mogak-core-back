import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AppEnv } from '../../../config/app-env';
import { TokenService } from './token.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createService(): TokenService {
  const config = {
    getOrThrow: vi.fn().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService<AppEnv, true>;

  return new TokenService(config);
}

describe('TokenService', () => {
  it('puts user, role, access type, and session ID in access tokens', async () => {
    const service = createService();

    const tokens = await service.issue({
      userId: 7,
      email: 'mogak@example.test',
      role: 'USER',
      sessionId: SESSION_ID,
    });

    await expect(service.verifyAccess(tokens.accessToken)).resolves.toEqual({
      userId: 7,
      email: 'mogak@example.test',
      role: 'USER',
      sessionId: SESSION_ID,
    });
  });

  it('rejects an access token at the refresh-token boundary', async () => {
    const service = createService();
    const tokens = await service.issue({ userId: 7, role: 'USER', sessionId: SESSION_ID });

    await expect(service.verifyRefresh(tokens.accessToken)).rejects.toEqual(
      new AppException(AppErrorCode.WRONG_TOKEN),
    );
  });

  it('hashes refresh tokens without preserving their raw value', () => {
    const service = createService();

    expect(service.hashRefreshToken('raw-refresh-token')).toBe(
      '0881b36898a91d864edaf39d2b2bd5801d5f873e3142a9ec5b3b574c4f6b51e5',
    );
  });
});
