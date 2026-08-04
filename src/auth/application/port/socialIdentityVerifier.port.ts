import type { SocialProvider } from '../../domain/vo/socialProvider.vo';
import type { VerifiedSocialIdentity } from '../../domain/vo/verifiedSocialIdentity.vo';

export const SOCIAL_IDENTITY_VERIFIER = Symbol('SOCIAL_IDENTITY_VERIFIER');

export interface SocialIdentityVerifier {
  supports(provider: SocialProvider): boolean;
  verify(token: string): Promise<VerifiedSocialIdentity>;
}

export interface SocialIdentityVerifierPort {
  verify(provider: SocialProvider, token: string): Promise<VerifiedSocialIdentity>;
}
