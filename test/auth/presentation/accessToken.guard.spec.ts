import { testMock } from '../../testMock';
import type { ExecutionContext } from '@nestjs/common';

import { DomainException } from '@core/common/error/domainException';
import type { AuthService } from '@core/auth/application/service/auth.service';
import { AccessTokenGuard } from '@api/auth/presentation/controller/accessToken.guard';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('액세스 토큰 가드', () => {
  it('참조한 세션이 활성 상태이면 액세스 클레임을 연결한다', async () => {
    const authService = {
      authenticateAccessToken: testMock().mockResolvedValue({
        userId: 3,
        role: 'USER',
        sessionId: SESSION_ID,
      }),
    } as unknown as AuthService;
    const guard = new AccessTokenGuard(authService);
    const request = { headers: { authorization: 'Bearer accessToken' } };

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({ user: { userId: 3, role: 'USER', sessionId: SESSION_ID } });
  });

  it('현재 세션이 로그아웃된 뒤에는 T005 오류를 반환한다', async () => {
    const authService = {
      authenticateAccessToken: testMock().mockRejectedValue(new DomainException('LOGOUT_TOKEN')),
    } as unknown as AuthService;
    const guard = new AccessTokenGuard(authService);

    await expect(
      guard.canActivate(executionContext({ headers: { authorization: 'Bearer accessToken' } })),
    ).rejects.toEqual(new DomainException('LOGOUT_TOKEN'));
  });
});
