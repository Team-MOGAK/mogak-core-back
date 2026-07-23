import { testMock } from '../../../../test/test-mock';
import type { ExecutionContext } from '@nestjs/common';

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

describe('액세스 토큰 가드', () => {
  it('참조한 세션이 활성 상태이면 액세스 클레임을 연결한다', async () => {
    const tokens = {
      verifyAccess: testMock().mockResolvedValue({
        userId: 3,
        role: 'USER',
        sessionId: SESSION_ID,
      }),
    } as unknown as TokenService;
    const sessions = {
      findActiveById: testMock().mockResolvedValue({ id: SESSION_ID, userId: 3 }),
    } as unknown as AuthSessionsRepository;
    const guard = new AccessTokenGuard(tokens, sessions);
    const request = { headers: { authorization: 'Bearer access-token' } };

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({ user: { userId: 3, role: 'USER', sessionId: SESSION_ID } });
  });

  it('현재 세션이 로그아웃된 뒤에는 T005 오류를 반환한다', async () => {
    const tokens = {
      verifyAccess: testMock().mockResolvedValue({
        userId: 3,
        role: 'USER',
        sessionId: SESSION_ID,
      }),
    } as unknown as TokenService;
    const sessions = {
      findActiveById: testMock().mockResolvedValue(null),
    } as unknown as AuthSessionsRepository;
    const guard = new AccessTokenGuard(tokens, sessions);

    await expect(
      guard.canActivate(executionContext({ headers: { authorization: 'Bearer access-token' } })),
    ).rejects.toEqual(new AppException(AppErrorCode.LOGOUT_TOKEN));
  });
});
