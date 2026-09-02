import type { ExecutionContext } from '@nestjs/common';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { RegisteredUserGuard } from '@api/auth/presentation/controller/registeredUser.guard';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('가입 완료 사용자 가드', () => {
  const guard = new RegisteredUserGuard();

  it('PENDING 사용자의 보호 기능 접근에는 최신 토큰 갱신을 요구한다', () => {
    expect(() =>
      guard.canActivate(
        executionContext({
          user: { userId: 1, role: 'PENDING', sessionId: 'session-id' },
        }),
      ),
    ).toThrow(new DomainException(DomainErrorCode.TOKEN_REFRESH_REQUIRED));
  });

  it('주체가 없는 보호 기능 접근은 권한 부족으로 거부한다', () => {
    expect(() => guard.canActivate(executionContext({}))).toThrow(
      new DomainException(DomainErrorCode.FORBIDDEN),
    );
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
