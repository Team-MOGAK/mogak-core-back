import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { ConfigService } from '@nestjs/config';

import { testMock } from '../../testMock';
import { JwtTokenService } from '@infra/auth/service/token.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';

function createService(): JwtTokenService {
  const config = {
    get: testMock().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
    getOrThrow: testMock().mockReturnValue('test-jwt-secret-with-at-least-thirty-two-characters'),
  } as unknown as ConfigService;

  return new JwtTokenService(config);
}

function configFor(secret: unknown): ConfigService {
  return { get: testMock().mockReturnValue(secret) } as unknown as ConfigService;
}

describe('토큰 서비스', () => {
  it.each([
    ['누락', undefined],
    ['빈 문자열', ''],
    ['공백', '   '],
    ['ASCII 31바이트', 'x'.repeat(31)],
    ['UTF-8 30바이트', '가'.repeat(10)],
  ])('JWT secret이 %s이면 기동을 거부한다', (_label, secret) => {
    expect(() => new JwtTokenService(configFor(secret))).toThrow();
  });

  it('UTF-8 32바이트 secret은 기동을 허용한다', () => {
    expect(() => new JwtTokenService(configFor('가'.repeat(10) + 'aa'))).not.toThrow();
  });

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
      new DomainException(DomainErrorCode.WRONG_TOKEN),
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
