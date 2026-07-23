import type { UserRole } from './authenticated-user';
import type { SocialIdentity } from './social-identity';

export type AuthUser = Readonly<{
  id: number;
  email: string | null;
  nickname: string | null;
  role: UserRole;
}>;

export type AuthSessionDraft = Readonly<{
  id: string;
  refreshTokenHash: string;
  expiresAt: Date;
}>;

export type AccountCreationInput = Readonly<{
  identity: SocialIdentity;
}>;

export type AuthPersistence = {
  findUserById(userId: number): Promise<AuthUser | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserBySocialIdentity(provider: string, providerUserId: string): Promise<AuthUser | null>;
  createAccount<T>(
    input: AccountCreationInput,
    createSession: (user: AuthUser) => Promise<Readonly<{ result: T; session: AuthSessionDraft }>>,
  ): Promise<T>;
  createSession(userId: number, session: AuthSessionDraft): Promise<void>;
  rotateSession(
    input: Readonly<{
      sessionId: string;
      currentRefreshTokenHash: string;
      nextRefreshTokenHash: string;
      nextExpiresAt: Date;
      now: Date;
    }>,
  ): Promise<boolean>;
  deleteSession(sessionId: string, userId: number): Promise<void>;
  deleteUser(userId: number): Promise<boolean>;
};
