import { Inject, Injectable } from '@nestjs/common';

import { generateId } from '../../../common/util/id-generator';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { DomainException } from '../../../common/http/domain.exception';
import {
  validateNewSocialIdentity,
  type SocialProvider,
  type SocialIdentityValidation,
} from '../../domain/entity/auth.entity';
import {
  DuplicateEmailException,
  DuplicateSocialAccountException,
} from '../../domain/exception/auth-persistence.exception';
import { AUTH_PERSISTENCE, type AuthPersistencePort } from '../port/auth-persistence.port';
import {
  SOCIAL_IDENTITY_VERIFIER,
  type SocialIdentityVerifierPort,
} from '../port/social-identity-verifier.port';
import { TOKEN_ISSUER, type TokenIssuerPort } from '../port/token-issuer.port';
import type { TokenResult, SocialLoginResult, AuthUser } from '../type/auth.result';
import type { AuthenticatedPrincipal } from '../type/authenticated-principal';

const REFRESH_TOKEN_TTL_MILLISECONDS = 31 * 24 * 60 * 60 * 1_000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(SOCIAL_IDENTITY_VERIFIER)
    private readonly verifiers: SocialIdentityVerifierPort,
    @Inject(AUTH_PERSISTENCE) private readonly persistence: AuthPersistencePort,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuerPort,
  ) {}

  async login(provider: SocialProvider, token: string): Promise<SocialLoginResult> {
    const identity = await this.verifiers.verify(provider, token);
    if (identity.provider !== provider) {
      throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }

    const existingUser = await this.persistence.findUserBySocialIdentity(
      identity.provider,
      identity.providerUserId,
    );
    if (existingUser !== null) {
      return this.issueSession(existingUser);
    }

    this.throwForInvalidIdentity(validateNewSocialIdentity(identity));
    if (
      identity.email !== null &&
      (await this.persistence.findUserByEmail(identity.email)) !== null
    ) {
      throw new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED);
    }

    try {
      const newUser = await this.persistence.createAccount(identity);
      return this.issueSession(newUser);
    } catch (error: unknown) {
      if (error instanceof DuplicateEmailException) {
        throw new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED);
      }
      if (error instanceof DuplicateSocialAccountException) {
        const winner = await this.persistence.findUserBySocialIdentity(
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
    const claims = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.persistence.findUserById(claims.userId);
    if (user === null) {
      throw new DomainException(AppErrorCode.WRONG_TOKEN);
    }
    const nextTokens = await this.tokens.issue(this.principal(user, claims.sessionId));
    const now = new Date();
    const rotated = await this.persistence.rotateSession({
      sessionId: claims.sessionId,
      currentRefreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
      nextRefreshTokenHash: this.tokens.hashRefreshToken(nextTokens.refreshToken),
      nextExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MILLISECONDS),
      now,
    });
    if (!rotated) {
      throw new DomainException(AppErrorCode.WRONG_TOKEN);
    }
    return nextTokens;
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const principal = await this.tokens.verifyAccess(token);
    if (!(await this.persistence.isSessionActive(principal.sessionId, principal.userId))) {
      throw new DomainException(AppErrorCode.LOGOUT_TOKEN);
    }
    return principal;
  }

  async logout(userId: number, sessionId: string): Promise<void> {
    await this.persistence.deleteSession(sessionId, userId);
  }

  async withdraw(userId: number): Promise<void> {
    if (!(await this.persistence.deleteUser(userId))) {
      throw new DomainException(AppErrorCode.USER_NOT_FOUND);
    }
  }

  private throwForInvalidIdentity(validation: SocialIdentityValidation): void {
    if (validation.success) return;
    const errorCode = {
      PROVIDER_USER_ID_REQUIRED: AppErrorCode.INVALID_SOCIAL_TOKEN,
      EMAIL_REQUIRED: AppErrorCode.SOCIAL_EMAIL_REQUIRED,
      EMAIL_NOT_VERIFIED: AppErrorCode.SOCIAL_EMAIL_NOT_VERIFIED,
    }[validation.reason];
    throw new DomainException(errorCode);
  }

  private async issueSession(user: AuthUser): Promise<SocialLoginResult> {
    const sessionId = generateId();
    const tokens = await this.tokens.issue(this.principal(user, sessionId));
    await this.persistence.createSession(user.id, {
      id: sessionId,
      refreshTokenHash: this.tokens.hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MILLISECONDS),
    });
    return {
      isRegistered: user.nickname !== null && user.nickname.length > 0,
      userId: user.id,
      tokens,
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
}
