import { Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/appErrorCode';
import { DomainException } from '../../../common/http/domain.exception';
import type {
  SocialIdentityVerifier,
  SocialIdentityVerifierPort,
} from '../../application/port/socialIdentityVerifier.port';
import type { SocialProvider } from '../../domain/vo/socialProvider.vo';
import type { VerifiedSocialIdentity } from '../../domain/vo/verifiedSocialIdentity.vo';

@Injectable()
export class SocialIdentityVerifierRegistry implements SocialIdentityVerifierPort {
  constructor(private readonly verifiers: readonly SocialIdentityVerifier[]) {}

  async verify(provider: SocialProvider, token: string): Promise<VerifiedSocialIdentity> {
    if (token.trim().length === 0) throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);

    const verifier = this.verifiers.find((candidate) => candidate.supports(provider));
    if (verifier === undefined) throw new DomainException(AppErrorCode.UNSUPPORTED_SOCIAL_PROVIDER);

    return verifier.verify(token);
  }
}
