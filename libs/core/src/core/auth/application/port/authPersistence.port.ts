import type { VerifiedSocialIdentity } from '../../domain/vo/verifiedSocialIdentity.vo';
import type {
  RegistrationRole,
  RegistrationSnapshot,
} from '@core/users/domain/policy/userRegistration.policy';
import type { AuthUser, SessionDraft } from '../type/auth.result';
import type { SessionRotationCommand } from '../type/auth.command';

export const AUTH_PERSISTENCE = Symbol('AUTH_PERSISTENCE');

export interface AuthPersistencePort {
  findUserById(userId: number): Promise<AuthUser | null>;
  findUserBySocialIdentity(
    provider: VerifiedSocialIdentity['provider'],
    providerUserId: string,
  ): Promise<AuthUser | null>;
  findRegistrationSnapshot(userId: number): Promise<RegistrationSnapshot>;
  normalizeNullRole(userId: number, role: RegistrationRole): Promise<AuthUser>;
  createAccount(identity: VerifiedSocialIdentity): Promise<AuthUser>;
  createSession(userId: number, session: SessionDraft): Promise<void>;
  rotateSession(input: SessionRotationCommand): Promise<boolean>;
  isSessionActive(sessionId: string, userId: number): Promise<boolean>;
  deleteSession(sessionId: string, userId: number): Promise<void>;
  deleteUser(userId: number): Promise<boolean>;
}
