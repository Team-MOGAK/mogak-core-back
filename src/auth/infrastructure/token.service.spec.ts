import type { ConfigService } from '@nestjs/config';

import { testMock } from '../../../test/test-mock';
import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import type { AppEnv } from '../../config/app-env';
import { TokenService } from './token.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createService(): TokenService {
  const config = {
    getOrThrow: testMock().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService<AppEnv, true>;

  return new TokenService(config);
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

  it('원문 값을 보존하지 않고 리프레시 토큰을 해시한다', () => {
    const service = createService();

    expect(service.hashRefreshToken('raw-refresh-token')).toBe(
      '0881b36898a91d864edaf39d2b2bd5801d5f873e3142a9ec5b3b574c4f6b51e5',
    );
  });
});
