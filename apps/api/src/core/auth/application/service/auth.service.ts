import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { generateId } from '@core/common/util/idGenerator';
import {
  registrationRoleFor,
  type RegistrationRole,
} from '@core/users/domain/policy/userRegistration.policy';

import {
  validateNewSocialIdentity,
  type SocialIdentityValidation,
} from '../../domain/policy/socialIdentity.policy';
import type { SocialProvider } from '../../domain/vo/socialProvider.vo';
import {
  DuplicateEmailException,
  DuplicateSocialAccountException,
  SessionUserNotFoundAfterLockException,
} from '../../domain/exception/authPersistence.exception';
import type { AuthPersistencePort } from '../port/authPersistence.port';
import type { AuthTokenVerifierPort } from '../port/authTokenVerifier.port';
import type { SessionTokenIssuerPort } from '../port/sessionTokenIssuer.port';
import type { SocialIdentityVerifierPort } from '../port/socialIdentityVerifier.port';
import type {
  TokenResult,
  SocialLoginFlow,
  SocialLoginOutcome,
  AuthUser,
} from '../type/auth.result';
import type { AuthenticatedPrincipal } from '../type/authenticatedPrincipal';

export class AuthService {
  constructor(
    private readonly socialIdentityVerifier: SocialIdentityVerifierPort,
    private readonly authPersistence: AuthPersistencePort,
    private readonly sessionTokenIssuer: SessionTokenIssuerPort,
    private readonly authTokenVerifier: AuthTokenVerifierPort,
  ) {}

  async login(provider: SocialProvider, token: string): Promise<SocialLoginOutcome> {
    const identity = await this.socialIdentityVerifier.verify(provider, token);
    if (identity.provider !== provider) {
      throw new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN);
    }

    const existingUser = await this.authPersistence.findUserBySocialIdentity(
      identity.provider,
      identity.providerUserId,
    );
    if (existingUser !== null) {
      return this.issueSession(existingUser, 'RESUME');
    }

    this.throwForInvalidIdentity(validateNewSocialIdentity(identity));
    if (
      identity.email !== null &&
      (await this.authPersistence.findUserByEmail(identity.email)) !== null
    ) {
      throw new DomainException(DomainErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED);
    }

    try {
      const newUser = await this.authPersistence.createAccount(identity);
      return this.issueSession(newUser, 'NEW');
    } catch (error) {
      if (
        error instanceof DuplicateEmailException ||
        error instanceof DuplicateSocialAccountException
      ) {
        const winner = await this.authPersistence.findUserBySocialIdentity(
          identity.provider,
          identity.providerUserId,
        );
        if (winner !== null) {
          return this.issueSession(winner, 'RESUME');
        }
        if (error instanceof DuplicateEmailException) {
          throw new DomainException(DomainErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED);
        }
      }
      throw error;
    }
  }

  async refresh(refreshToken: string): Promise<TokenResult> {
    const claims = await this.authTokenVerifier.verifyRefresh(refreshToken);
    const user = await this.authPersistence.findUserById(claims.userId);
    if (user === null) {
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    }
    const nextTokens = await this.sessionTokenIssuer.issue(this.principal(user, claims.sessionId));
    const rotated = await this.authPersistence.rotateSession({
      sessionId: claims.sessionId,
      currentRefreshTokenHash: claims.refreshTokenHash,
      nextRefreshTokenHash: nextTokens.refreshTokenHash,
      nextExpiresAt: nextTokens.refreshTokenExpiresAt,
      now: new Date(),
    });
    if (!rotated) {
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    }
    return this.tokens(nextTokens);
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const principal = await this.authTokenVerifier.verifyAccess(token);
    if (!(await this.authPersistence.isSessionActive(principal.sessionId, principal.userId))) {
      throw new DomainException(DomainErrorCode.LOGOUT_TOKEN);
    }
    return principal;
  }

  async logout(userId: number, sessionId: string): Promise<void> {
    await this.authPersistence.deleteSession(sessionId, userId);
  }

  async withdraw(userId: number): Promise<void> {
    if (!(await this.authPersistence.deleteUser(userId))) {
      throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
    }
  }

  private throwForInvalidIdentity(validation: SocialIdentityValidation): void {
    if (validation.success) return;
    const errorCode = (
      {
        PROVIDER_USER_ID_REQUIRED: 'INVALID_SOCIAL_TOKEN',
        EMAIL_REQUIRED: 'SOCIAL_EMAIL_REQUIRED',
        EMAIL_NOT_VERIFIED: 'SOCIAL_EMAIL_NOT_VERIFIED',
      } as const
    )[validation.reason];
    throw new DomainException(errorCode);
  }

  private async issueSession(
    user: AuthUser,
    requestedFlow: Extract<SocialLoginFlow, 'NEW' | 'RESUME'>,
  ): Promise<SocialLoginOutcome> {
    const sessionUser = user.role === null ? await this.normalizeNullRole(user.id) : user;
    const sessionId = generateId();
    const issuedTokens = await this.sessionTokenIssuer.issue(
      this.principal(sessionUser, sessionId),
    );
    try {
      await this.authPersistence.createSession(sessionUser.id, {
        id: sessionId,
        refreshTokenHash: issuedTokens.refreshTokenHash,
        expiresAt: issuedTokens.refreshTokenExpiresAt,
      });
    } catch (error: unknown) {
      if (error instanceof SessionUserNotFoundAfterLockException) {
        throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
      }
      throw error;
    }
    return {
      flow: sessionUser.role === 'USER' ? 'REGISTERED' : requestedFlow,
      result: {
        isRegistered: sessionUser.role === 'USER',
        userId: sessionUser.id,
        tokens: this.tokens(issuedTokens),
      },
    };
  }

  private async normalizeNullRole(userId: number): Promise<AuthUser> {
    const snapshot = await this.authPersistence.findRegistrationSnapshot(userId);
    const role: RegistrationRole = registrationRoleFor(snapshot);
    return this.authPersistence.normalizeNullRole(userId, role);
  }

  private principal(user: AuthUser, sessionId: string): AuthenticatedPrincipal {
    if (user.role === null) {
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    }
    return {
      userId: user.id,
      role: user.role,
      sessionId,
      ...(user.email === null ? {} : { email: user.email }),
    };
  }

  private tokens(tokens: { accessToken: string; refreshToken: string }): TokenResult {
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
}
