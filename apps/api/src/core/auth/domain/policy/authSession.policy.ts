export type SessionRotationEligibility =
  | Readonly<{ success: true }>
  | Readonly<{ success: false; reason: 'SESSION_EXPIRED' | 'REFRESH_TOKEN_MISMATCH' }>;

export function canRotateSession(
  session: Readonly<{ expiresAt: Date; refreshTokenHash: string }>,
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
