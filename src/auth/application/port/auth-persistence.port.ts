import type { VerifiedSocialIdentity } from '../../domain/entity/auth.entity';
import type { AuthUser, SessionDraft } from '../type/auth.result';
import type { SessionRotationCommand } from '../type/auth.command';

export const AUTH_PERSISTENCE = Symbol('AUTH_PERSISTENCE');

export interface AuthPersistencePort {
  findUserById(userId: number): Promise<AuthUser | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserBySocialIdentity(
    provider: VerifiedSocialIdentity['provider'],
    providerUserId: string,
  ): Promise<AuthUser | null>;
  createAccount<T>(
    input: Readonly<{ identity: VerifiedSocialIdentity }>,
    createSession: (user: AuthUser) => Promise<Readonly<{ result: T; session: SessionDraft }>>,
  ): Promise<T>;
  createSession(userId: number, session: SessionDraft): Promise<void>;
  rotateSession(input: SessionRotationCommand): Promise<boolean>;
  isSessionActive(sessionId: string, userId: number): Promise<boolean>;
  deleteSession(sessionId: string, userId: number): Promise<void>;
  deleteUser(userId: number): Promise<boolean>;
}
