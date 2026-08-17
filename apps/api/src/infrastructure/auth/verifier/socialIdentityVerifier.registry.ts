import { DomainException } from '@core/common/error/domainException';
import { Injectable } from '@nestjs/common';

import type {
  SocialIdentityVerifier,
  SocialIdentityVerifierPort,
} from '@core/auth/application/port/socialIdentityVerifier.port';
import type { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import type { VerifiedSocialIdentity } from '@core/auth/domain/vo/verifiedSocialIdentity.vo';

@Injectable()
export class SocialIdentityVerifierRegistry implements SocialIdentityVerifierPort {
  constructor(private readonly verifiers: readonly SocialIdentityVerifier[]) {}

  async verify(provider: SocialProvider, token: string): Promise<VerifiedSocialIdentity> {
    if (token.trim().length === 0) throw new DomainException('INVALID_SOCIAL_TOKEN');

    const verifier = this.verifiers.find((candidate) => candidate.supports(provider));
    if (verifier === undefined) throw new DomainException('UNSUPPORTED_SOCIAL_PROVIDER');

    return verifier.verify(token);
  }
}
