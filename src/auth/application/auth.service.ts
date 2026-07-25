import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import type { AuthPersistence, AuthSessionDraft, AuthUser } from '../domain/auth-persistence.port';
import type { SocialIdentity } from '../domain/social-identity';
import type { SocialProvider } from '../domain/social-provider';
import type { TokenPair } from '../domain/token-pair';
import {
  SOCIAL_IDENTITY_VERIFIER_REGISTRY,
  type SocialIdentityVerifierRegistry,
} from '../infrastructure/social-identity-verifier.registry';
import { TokenService } from '../infrastructure/token.service';

export const AUTH_PERSISTENCE = Symbol('AUTH_PERSISTENCE');
export const SESSION_ID_GENERATOR = Symbol('SESSION_ID_GENERATOR');

const REFRESH_TOKEN_TTL_MILLISECONDS = 31 * 24 * 60 * 60 * 1_000;

export type SocialLoginResponse = Readonly<{
  isRegistered: boolean;
  userId: number;
  tokens: TokenPair;
}>;

@Injectable()
export class AuthService {
  constructor(
    @Inject(SOCIAL_IDENTITY_VERIFIER_REGISTRY)
    private readonly verifiers: SocialIdentityVerifierRegistry,
    @Inject(AUTH_PERSISTENCE) private readonly persistence: AuthPersistence,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SESSION_ID_GENERATOR) private readonly createSessionId: () => string = randomUUID,
  ) {}

  async login(provider: SocialProvider, token: string): Promise<SocialLoginResponse> {
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

    this.validateNewIdentity(identity);
    if (
      identity.email !== null &&
      (await this.persistence.findUserByEmail(identity.email)) !== null
    ) {
      throw new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED);
    }

    try {
      return await this.persistence.createAccount({ identity }, async (user) => {
        return this.prepareLogin(user);
      });
    } catch (error: unknown) {
      if (isUniqueConstraint(error, 'users_email_unique')) {
        throw new DomainException(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED);
      }
      if (isUniqueConstraint(error, 'social_accounts_provider_user_unique')) {
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

  async refresh(refreshToken: string): Promise<TokenPair> {
    const claims = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.persistence.findUserById(claims.userId);
    if (user === null) {
      throw new DomainException(AppErrorCode.WRONG_TOKEN);
    }
    const nextTokens = await this.tokens.issue({
      userId: user.id,
      role: user.role,
      sessionId: claims.sessionId,
      ...(user.email === null ? {} : { email: user.email }),
    });
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

  async logout(userId: number, sessionId: string): Promise<void> {
    await this.persistence.deleteSession(sessionId, userId);
  }

  async withdraw(userId: number): Promise<void> {
    const deleted = await this.persistence.deleteUser(userId);
    if (!deleted) {
      throw new DomainException(AppErrorCode.USER_NOT_FOUND);
    }
  }

  private validateNewIdentity(identity: SocialIdentity): void {
    if (identity.providerUserId.length === 0) {
      throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }
    if (identity.email === null) {
      if (identity.provider === 'KAKAO') {
        return;
      }
      throw new DomainException(AppErrorCode.SOCIAL_EMAIL_REQUIRED);
    }
    if (!identity.emailVerified) {
      throw new DomainException(AppErrorCode.SOCIAL_EMAIL_NOT_VERIFIED);
    }
  }

  private async issueSession(user: AuthUser): Promise<SocialLoginResponse> {
    const prepared = await this.prepareLogin(user);
    await this.persistence.createSession(prepared.result.userId, prepared.session);
    return prepared.result;
  }

  private async prepareLogin(
    user: AuthUser,
  ): Promise<Readonly<{ result: SocialLoginResponse; session: AuthSessionDraft }>> {
    const sessionId = this.createSessionId();
    const tokens = await this.tokens.issue({
      userId: user.id,
      role: user.role,
      sessionId,
      ...(user.email === null ? {} : { email: user.email }),
    });
    return {
      result: {
        isRegistered: user.nickname !== null && user.nickname.length > 0,
        userId: user.id,
        tokens,
      },
      session: this.sessionDraft(sessionId, tokens),
    };
  }

  private sessionDraft(sessionId: string, tokens: TokenPair): AuthSessionDraft {
    return {
      id: sessionId,
      refreshTokenHash: this.tokens.hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MILLISECONDS),
    };
  }
}

function isUniqueConstraint(error: unknown, constraint: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
