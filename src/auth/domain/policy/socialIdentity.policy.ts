import type { VerifiedSocialIdentity } from '../vo/verifiedSocialIdentity.vo';

export type SocialIdentityValidation =
  | Readonly<{ success: true }>
  | Readonly<{
      success: false;
      reason: 'PROVIDER_USER_ID_REQUIRED' | 'EMAIL_REQUIRED' | 'EMAIL_NOT_VERIFIED';
    }>;

export function validateNewSocialIdentity(
  identity: VerifiedSocialIdentity,
): SocialIdentityValidation {
  if (identity.providerUserId.length === 0) {
    return { success: false, reason: 'PROVIDER_USER_ID_REQUIRED' };
  }
  if (identity.email === null) {
    return identity.provider === 'KAKAO'
      ? { success: true }
      : { success: false, reason: 'EMAIL_REQUIRED' };
  }
  return identity.emailVerified
    ? { success: true }
    : { success: false, reason: 'EMAIL_NOT_VERIFIED' };
}
