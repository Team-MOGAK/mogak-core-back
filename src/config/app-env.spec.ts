import { parseAppEnv } from './app-env';

describe('애플리케이션 환경 변수', () => {
  it('안전한 개발 기본값을 사용한다', () => {
    expect(
      parseAppEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak',
        JWT_SECRET: 'test-jwt-secret-with-at-least-thirty-two-characters',
        APPLE_CLIENT_IDS: 'com.mogak.ios',
        GOOGLE_CLIENT_IDS: 'mogak-web-client',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak',
      JWT_SECRET: 'test-jwt-secret-with-at-least-thirty-two-characters',
      APPLE_CLIENT_IDS: 'com.mogak.ios',
      GOOGLE_CLIENT_IDS: 'mogak-web-client',
    });
  });

  it('데이터베이스 URL이 없으면 애플리케이션 시작 전에 실패한다', () => {
    expect(() => parseAppEnv({})).toThrow('DATABASE_URL');
  });

  it('32자보다 짧은 JWT 비밀키를 거부한다', () => {
    expect(() =>
      parseAppEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak',
        JWT_SECRET: 'too-short',
        APPLE_CLIENT_IDS: 'com.mogak.ios',
        GOOGLE_CLIENT_IDS: 'mogak-web-client',
      }),
    ).toThrow('JWT_SECRET');
  });
});
