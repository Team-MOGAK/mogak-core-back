import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { ConfigService } from '@nestjs/config';

import { testMock } from '../../testMock';
import { JwtTokenService } from '@infra/auth/service/token.service';

const SESSION_ID = 'ebc0d040-a6e8-4a95-9c13-5f84c7bc6a5f';
const VALID_SECRET = 'test-jwt-secret-with-at-least-thirty-two-characters';

function createConfig(secret: unknown, legacySecret?: unknown): ConfigService {
  const config = {
    get: testMock().mockImplementation((...args: unknown[]) => {
      if (args[0] === 'JWT_SECRET') return secret;
      if (args[0] === 'JWT_SECRET_KEY') return legacySecret;
      return undefined;
    }),
    getOrThrow: testMock().mockReturnValue(legacySecret),
  } as unknown as ConfigService;
  return config;
}

function createService(secret = VALID_SECRET): JwtTokenService {
  return new JwtTokenService(createConfig(secret));
}

describe('토큰 서비스 설정 경계', () => {
  it('JWT_SECRET이 없으면 legacy JWT_SECRET_KEY를 사용한다', () => {
    expect(() => new JwtTokenService(createConfig(undefined, VALID_SECRET))).not.toThrow();
  });

  it.each([undefined, '', '   '])('JWT secret이 비어 있으면 기동을 거부한다 (%p)', (secret) => {
    expect(() => new JwtTokenService(createConfig(secret))).toThrow(/JWT_SECRET/);
  });

  it('UTF-8 바이트 기준 32바이트보다 짧은 secret을 거부한다', () => {
    expect(() => new JwtTokenService(createConfig('a'.repeat(31)))).toThrow(/32바이트/);
    expect(() => new JwtTokenService(createConfig('가'.repeat(10)))).toThrow(/32바이트/);
  });

  it('UTF-8 바이트 기준 32바이트 secret을 허용한다', () => {
    expect(() => new JwtTokenService(createConfig('a'.repeat(32)))).not.toThrow();
  });
});

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
