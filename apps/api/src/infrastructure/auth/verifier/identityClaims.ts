import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { JWTPayload } from 'jose';

import type { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import type { VerifiedSocialIdentity } from '@core/auth/domain/vo/verifiedSocialIdentity.vo';

export function identityFromJwtClaims(
  provider: SocialProvider,
  claims: Pick<JWTPayload, 'sub'> & Record<string, unknown>,
): VerifiedSocialIdentity {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN);
  }
  return {
    provider,
    providerUserId: claims.sub,
    email: typeof claims.email === 'string' && claims.email.length > 0 ? claims.email : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  };
}
