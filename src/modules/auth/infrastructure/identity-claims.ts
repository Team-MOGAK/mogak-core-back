import type { JWTPayload } from 'jose';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { SocialIdentity } from '../domain/social-identity';
import type { SocialProvider } from '../domain/social-provider';

export function identityFromJwtClaims(
  provider: SocialProvider,
  claims: Pick<JWTPayload, 'sub'> & Record<string, unknown>,
): SocialIdentity {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new AppException(AppErrorCode.INVALID_SOCIAL_TOKEN);
  }

  return {
    provider,
    providerUserId: claims.sub,
    email: typeof claims.email === 'string' && claims.email.length > 0 ? claims.email : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  };
}
