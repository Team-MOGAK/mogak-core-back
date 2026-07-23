import { describe, expect, it } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { identityFromJwtClaims } from './identity-claims';

describe('identityFromJwtClaims', () => {
  it('normalizes a string email_verified claim from an ID token', () => {
    expect(
      identityFromJwtClaims('GOOGLE', {
        sub: 'google-subject',
        email: 'mogak@example.test',
        email_verified: 'true',
      }),
    ).toEqual({
      provider: 'GOOGLE',
      providerUserId: 'google-subject',
      email: 'mogak@example.test',
      emailVerified: true,
    });
  });

  it('rejects a token without the provider subject', () => {
    expect(() => identityFromJwtClaims('APPLE', { email: 'mogak@example.test' })).toThrow(
      new AppException(AppErrorCode.INVALID_SOCIAL_TOKEN),
    );
  });
});
