import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AuthSessionsRepository } from '../infrastructure/auth-sessions.repository';
import type { TokenService } from '../infrastructure/token.service';
import { AccessTokenGuard } from './access-token.guard';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  it('attaches access claims when the referenced session is active', async () => {
    const tokens = {
      verifyAccess: vi.fn().mockResolvedValue({ userId: 3, role: 'USER', sessionId: SESSION_ID }),
    } as unknown as TokenService;
    const sessions = {
      findActiveById: vi.fn().mockResolvedValue({ id: SESSION_ID, userId: 3 }),
    } as unknown as AuthSessionsRepository;
    const guard = new AccessTokenGuard(tokens, sessions);
    const request = { headers: { authorization: 'Bearer access-token' } };

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({ user: { userId: 3, role: 'USER', sessionId: SESSION_ID } });
  });

  it('returns T005 after the current session has been logged out', async () => {
    const tokens = {
      verifyAccess: vi.fn().mockResolvedValue({ userId: 3, role: 'USER', sessionId: SESSION_ID }),
    } as unknown as TokenService;
    const sessions = {
      findActiveById: vi.fn().mockResolvedValue(null),
    } as unknown as AuthSessionsRepository;
    const guard = new AccessTokenGuard(tokens, sessions);

    await expect(
      guard.canActivate(executionContext({ headers: { authorization: 'Bearer access-token' } })),
    ).rejects.toEqual(new AppException(AppErrorCode.LOGOUT_TOKEN));
  });
});
