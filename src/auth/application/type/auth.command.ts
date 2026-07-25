import type { SocialProvider, VerifiedSocialIdentity } from '../../domain/entity/auth.entity';
import type { UserRole } from './authenticated-principal';

export type LoginCommand = Readonly<{ provider: SocialProvider; token: string }>;
export type RefreshCommand = Readonly<{ refreshToken: string }>;
export type SessionIssueCommand = Readonly<{
  userId: number;
  email: string | null;
  role: UserRole;
  sessionId: string;
}>;
export type SessionRotationCommand = Readonly<{
  sessionId: string;
  currentRefreshTokenHash: string;
  nextRefreshTokenHash: string;
  nextExpiresAt: Date;
  now: Date;
}>;
export type AccountCreationCommand = Readonly<{ identity: VerifiedSocialIdentity }>;
