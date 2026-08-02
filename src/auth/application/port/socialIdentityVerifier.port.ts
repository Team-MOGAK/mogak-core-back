import type { SocialProvider, VerifiedSocialIdentity } from '../../domain/entity/auth.entity';

export const SOCIAL_IDENTITY_VERIFIER = Symbol('SOCIAL_IDENTITY_VERIFIER');

export interface SocialIdentityVerifier {
  supports(provider: SocialProvider): boolean;
  verify(token: string): Promise<VerifiedSocialIdentity>;
}

export interface SocialIdentityVerifierPort {
  verify(provider: SocialProvider, token: string): Promise<VerifiedSocialIdentity>;
}
