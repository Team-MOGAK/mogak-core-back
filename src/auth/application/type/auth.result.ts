import type { UserRole } from './authenticated-principal';

export type TokenResult = Readonly<{ accessToken: string; refreshToken: string }>;

export type AuthUser = Readonly<{
  id: number;
  email: string | null;
  nickname: string | null;
  role: UserRole;
}>;

export type SessionDraft = Readonly<{
  id: string;
  refreshTokenHash: string;
  expiresAt: Date;
}>;

export type SocialLoginResult = Readonly<{
  isRegistered: boolean;
  userId: number;
  tokens: TokenResult;
}>;
