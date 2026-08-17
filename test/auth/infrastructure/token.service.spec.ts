import type { ConfigService } from '@nestjs/config';

import { testMock } from '../../testMock';
import { AppErrorCode } from '../../../src/common/http/appErrorCode';
import { DomainException } from '../../../src/common/domain.exception';
import { JwtTokenService } from '../../../src/auth/infrastructure/service/token.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createService(): JwtTokenService {
  const config = {
    get: testMock().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
    getOrThrow: testMock().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService;

  return new JwtTokenService(config);
}

describe('토큰 서비스', () => {
  it('액세스 토큰에 사용자와 역할과 액세스 종류와 세션 식별자를 담는다', async () => {
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

  it('리프레시 토큰 경계에서 액세스 토큰을 거부한다', async () => {
    const service = createService();
    const tokens = await service.issue({ userId: 7, role: 'USER', sessionId: SESSION_ID });

    await expect(service.verifyRefresh(tokens.accessToken)).rejects.toEqual(
      new DomainException(AppErrorCode.WRONG_TOKEN),
    );
  });

  it('검증한 리프레시 토큰과 함께 원문을 보존하지 않는 해시를 반환한다', async () => {
    const service = createService();
    const tokens = await service.issue({ userId: 7, role: 'USER', sessionId: SESSION_ID });

    await expect(service.verifyRefresh(tokens.refreshToken)).resolves.toMatchObject({
      userId: 7,
      sessionId: SESSION_ID,
      refreshTokenHash: expect.not.stringContaining(tokens.refreshToken),
    });
  });
});
