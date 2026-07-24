import type { SocialIdentity } from './social-identity';
import type { SocialProvider } from './social-provider';

export interface SocialIdentityVerifier {
  supports(provider: SocialProvider): boolean;
  verify(token: string): Promise<SocialIdentity>;
}
