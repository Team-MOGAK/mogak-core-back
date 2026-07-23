import { parseAppEnv } from './app-env';

const requiredEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak',
  JWT_SECRET: 'test-jwt-secret-with-at-least-thirty-two-characters',
  APPLE_CLIENT_IDS: 'com.mogak.ios',
  GOOGLE_CLIENT_IDS: 'mogak-web-client',
};

describe('애플리케이션 환경 변수', () => {
  it('안전한 개발 기본값을 사용한다', () => {
    expect(parseAppEnv(requiredEnv)).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      ...requiredEnv,
      CORS_ALLOWED_ORIGINS: [],
    });
  });

  it('쉼표로 구분한 완전한 origin만 CORS 허용 목록으로 정규화한다', () => {
    expect(
      parseAppEnv({
        ...requiredEnv,
        CORS_ALLOWED_ORIGINS: 'https://app.mogak.kr, https://admin.mogak.kr',
      }),
    ).toMatchObject({
      CORS_ALLOWED_ORIGINS: ['https://app.mogak.kr', 'https://admin.mogak.kr'],
    });
  });

  it('경로나 wildcard가 있는 CORS origin 설정을 기동 전에 거부한다', () => {
    expect(() =>
      parseAppEnv({
        ...requiredEnv,
        CORS_ALLOWED_ORIGINS: 'https://app.mogak.kr/api,*',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS');
  });

  it('데이터베이스 URL이 없으면 애플리케이션 시작 전에 실패한다', () => {
    expect(() => parseAppEnv({})).toThrow('DATABASE_URL');
  });

  it('32자보다 짧은 JWT 비밀키를 거부한다', () => {
    expect(() =>
      parseAppEnv({
        ...requiredEnv,
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('JWT_SECRET');
  });
});
