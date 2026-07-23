import { describe, expect, it } from 'vitest';

import { parseAppEnv } from './app-env';

describe('parseAppEnv', () => {
  it('uses safe development defaults', () => {
    expect(
      parseAppEnv({ DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak' }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/mogak',
    });
  });

  it('fails before bootstrap without DATABASE_URL', () => {
    expect(() => parseAppEnv({})).toThrow('DATABASE_URL');
  });
});
