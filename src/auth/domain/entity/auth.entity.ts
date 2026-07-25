export type SocialProvider = 'APPLE' | 'GOOGLE' | 'KAKAO';

export type SocialAccount = Readonly<{
  id: number;
  userId: number;
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AuthSession = Readonly<{
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type VerifiedSocialIdentity = Readonly<{
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}>;

export type SessionRotationEligibility =
  | Readonly<{ success: true }>
  | Readonly<{ success: false; reason: 'SESSION_EXPIRED' | 'REFRESH_TOKEN_MISMATCH' }>;

export type SocialIdentityValidation =
  | Readonly<{ success: true }>
  | Readonly<{
      success: false;
      reason: 'PROVIDER_USER_ID_REQUIRED' | 'EMAIL_REQUIRED' | 'EMAIL_NOT_VERIFIED';
    }>;

export function canRotateSession(
  session: AuthSession,
  refreshTokenHash: string,
  now: Date,
): SessionRotationEligibility {
  if (session.expiresAt.getTime() <= now.getTime()) {
    return { success: false, reason: 'SESSION_EXPIRED' };
  }
  if (session.refreshTokenHash !== refreshTokenHash) {
    return { success: false, reason: 'REFRESH_TOKEN_MISMATCH' };
  }
  return { success: true };
}

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
