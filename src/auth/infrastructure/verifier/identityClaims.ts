import type { JWTPayload } from 'jose';

import { AppErrorCode } from '../../../common/http/appErrorCode';
import { DomainException } from '../../../common/http/domain.exception';
import type { SocialProvider, VerifiedSocialIdentity } from '../../domain/entity/auth.entity';

export function identityFromJwtClaims(
  provider: SocialProvider,
  claims: Pick<JWTPayload, 'sub'> & Record<string, unknown>,
): VerifiedSocialIdentity {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
  }
  return {
    provider,
    providerUserId: claims.sub,
    email: typeof claims.email === 'string' && claims.email.length > 0 ? claims.email : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  };
}
