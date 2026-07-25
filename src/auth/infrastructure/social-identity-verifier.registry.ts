import { Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import type { SocialIdentity } from '../domain/social-identity';
import type { SocialIdentityVerifier } from '../domain/social-identity-verifier.port';
import type { SocialProvider } from '../domain/social-provider';

export const SOCIAL_IDENTITY_VERIFIER_REGISTRY = Symbol('SOCIAL_IDENTITY_VERIFIER_REGISTRY');

@Injectable()
export class SocialIdentityVerifierRegistry {
  constructor(private readonly verifiers: readonly SocialIdentityVerifier[]) {}

  async verify(provider: SocialProvider, token: string): Promise<SocialIdentity> {
    if (token.trim().length === 0) {
      throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }
    const verifier = this.verifiers.find((candidate) => candidate.supports(provider));
    if (verifier === undefined) {
      throw new DomainException(AppErrorCode.UNSUPPORTED_SOCIAL_PROVIDER);
    }
    return verifier.verify(token);
  }
}
