import type { ExecutionContext } from '@nestjs/common';

import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import { RegisteredUserGuard } from '../../../src/auth/presentation/controller/registered-user.guard';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('가입 완료 사용자 가드', () => {
  const guard = new RegisteredUserGuard();

  it('가입 전 사용자의 보호 기능 접근을 거부한다', () => {
    expect(() =>
      guard.canActivate(
        executionContext({
          user: { userId: 1, role: 'PENDING', sessionId: 'session-id' },
        }),
      ),
    ).toThrow(new DomainException(AppErrorCode.FORBIDDEN));
  });

  it('가입 완료 사용자의 보호 기능 접근을 허용한다', () => {
    expect(
      guard.canActivate(
        executionContext({
          user: { userId: 1, role: 'USER', sessionId: 'session-id' },
        }),
      ),
    ).toBe(true);
  });
});
