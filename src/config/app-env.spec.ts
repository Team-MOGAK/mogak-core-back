import { describe, expect, it } from 'vitest';

import { parseAppEnv } from './app-env';

describe('parseAppEnv', () => {
  it('uses safe development defaults', () => {
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

  it('fails before bootstrap without DATABASE_URL', () => {
    expect(() => parseAppEnv({})).toThrow('DATABASE_URL');
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
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
