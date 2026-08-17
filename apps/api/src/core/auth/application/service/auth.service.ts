import { CoreError } from '../../../common/error/coreError';
import { generateId } from '../../../common/util/idGenerator';

import {
  validateNewSocialIdentity,
  type SocialIdentityValidation,
} from '../../domain/policy/socialIdentity.policy';
import type { SocialProvider } from '../../domain/vo/socialProvider.vo';
import {
  DuplicateEmailException,
  DuplicateSocialAccountException,
} from '../../domain/exception/authPersistence.exception';
import type { AuthPersistencePort } from '../port/authPersistence.port';
import type { AuthTokenVerifierPort } from '../port/authTokenVerifier.port';
import type { SessionTokenIssuerPort } from '../port/sessionTokenIssuer.port';
import type { SocialIdentityVerifierPort } from '../port/socialIdentityVerifier.port';
import type { TokenResult, SocialLoginResult, AuthUser } from '../type/auth.result';
import type { AuthenticatedPrincipal } from '../type/authenticatedPrincipal';

export class AuthService {
  constructor(
    private readonly socialIdentityVerifier: SocialIdentityVerifierPort,
    private readonly authPersistence: AuthPersistencePort,
    private readonly sessionTokenIssuer: SessionTokenIssuerPort,
    private readonly authTokenVerifier: AuthTokenVerifierPort,
  ) {}

  async login(provider: SocialProvider, token: string): Promise<SocialLoginResult> {
    const identity = await this.socialIdentityVerifier.verify(provider, token);
    if (identity.provider !== provider) {
      throw new CoreError('INVALID_SOCIAL_TOKEN');
    }

    const existingUser = await this.authPersistence.findUserBySocialIdentity(
      identity.provider,
      identity.providerUserId,
    );
    if (existingUser !== null) {
      return this.issueSession(existingUser);
    }

    this.throwForInvalidIdentity(validateNewSocialIdentity(identity));
    if (
      identity.email !== null &&
      (await this.authPersistence.findUserByEmail(identity.email)) !== null
    ) {
      throw new CoreError('SOCIAL_ACCOUNT_LINK_REQUIRED');
    }

    try {
      const newUser = await this.authPersistence.createAccount(identity);
      return this.issueSession(newUser);
    } catch (error: unknown) {
      if (error instanceof DuplicateEmailException) {
        throw new CoreError('SOCIAL_ACCOUNT_LINK_REQUIRED');
      }
      if (error instanceof DuplicateSocialAccountException) {
        const winner = await this.authPersistence.findUserBySocialIdentity(
          identity.provider,
          identity.providerUserId,
        );
        if (winner !== null) {
          return this.issueSession(winner);
        }
      }
      throw error;
    }
  }

  async refresh(refreshToken: string): Promise<TokenResult> {
    const claims = await this.authTokenVerifier.verifyRefresh(refreshToken);
    const user = await this.authPersistence.findUserById(claims.userId);
    if (user === null) {
      throw new CoreError('WRONG_TOKEN');
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
      throw new CoreError('WRONG_TOKEN');
    }
    return this.tokens(nextTokens);
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const principal = await this.authTokenVerifier.verifyAccess(token);
    if (!(await this.authPersistence.isSessionActive(principal.sessionId, principal.userId))) {
      throw new CoreError('LOGOUT_TOKEN');
    }
    return principal;
  }

  async logout(userId: number, sessionId: string): Promise<void> {
    await this.authPersistence.deleteSession(sessionId, userId);
  }

  async withdraw(userId: number): Promise<void> {
    if (!(await this.authPersistence.deleteUser(userId))) {
      throw new CoreError('USER_NOT_FOUND');
    }
  }

  private throwForInvalidIdentity(validation: SocialIdentityValidation): void {
    if (validation.success) return;
    const errorCode = {
      PROVIDER_USER_ID_REQUIRED: 'INVALID_SOCIAL_TOKEN',
      EMAIL_REQUIRED: 'SOCIAL_EMAIL_REQUIRED',
      EMAIL_NOT_VERIFIED: 'SOCIAL_EMAIL_NOT_VERIFIED',
    }[validation.reason];
    throw new CoreError(errorCode);
  }

  private async issueSession(user: AuthUser): Promise<SocialLoginResult> {
    const sessionId = generateId();
    const issuedTokens = await this.sessionTokenIssuer.issue(this.principal(user, sessionId));
    await this.authPersistence.createSession(user.id, {
      id: sessionId,
      refreshTokenHash: issuedTokens.refreshTokenHash,
      expiresAt: issuedTokens.refreshTokenExpiresAt,
    });
    return {
      isRegistered: user.nickname !== null && user.nickname.length > 0,
      userId: user.id,
      tokens: this.tokens(issuedTokens),
    };
  }

  private principal(user: AuthUser, sessionId: string): AuthenticatedPrincipal {
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
