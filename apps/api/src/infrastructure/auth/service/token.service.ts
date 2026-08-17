import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

import type {
  AuthTokenVerifierPort,
  VerifiedRefreshToken,
} from '@core/auth/application/port/authTokenVerifier.port';
import type {
  IssuedSessionTokens,
  SessionTokenIssuerPort,
} from '@core/auth/application/port/sessionTokenIssuer.port';
import type {
  AuthenticatedPrincipal,
  UserRole,
} from '@core/auth/application/type/authenticatedPrincipal';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 31 * 24 * 60 * 60;
const CLOCK_TOLERANCE_SECONDS = 30;

@Injectable()
export class JwtTokenService implements SessionTokenIssuerPort, AuthTokenVerifierPort {
  private readonly secret: Uint8Array;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.secret = new TextEncoder().encode(
      config.get<string>('JWT_SECRET') ?? config.getOrThrow<string>('JWT_SECRET_KEY'),
    );
  }

  async issue(input: AuthenticatedPrincipal): Promise<IssuedSessionTokens> {
    const accessToken = await this.sign(
      {
        id: input.userId,
        role: input.role,
        token_type: ACCESS_TOKEN_TYPE,
        sid: input.sessionId,
        ...(input.email === undefined ? {} : { email: input.email }),
      },
      input.userId,
      ACCESS_TOKEN_TTL_SECONDS,
    );
    const refreshToken = await this.sign(
      { token_type: REFRESH_TOKEN_TYPE, sid: input.sessionId },
      input.userId,
      REFRESH_TOKEN_TTL_SECONDS,
    );
    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.hash(refreshToken),
      refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1_000),
    };
  }

  async verifyAccess(token: string): Promise<AuthenticatedPrincipal> {
    const payload = await this.verify(token);
    if (payload.token_type !== ACCESS_TOKEN_TYPE)
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    const userId = this.userIdFrom(payload);
    const role = this.roleFrom(payload.role);
    const sessionId = this.sessionIdFrom(payload.sid);
    const email =
      typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : undefined;
    return email === undefined ? { userId, role, sessionId } : { userId, email, role, sessionId };
  }

  async verifyRefresh(token: string): Promise<VerifiedRefreshToken> {
    const payload = await this.verify(token);
    if (payload.token_type !== REFRESH_TOKEN_TYPE)
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    return {
      userId: this.subjectUserIdFrom(payload),
      sessionId: this.sessionIdFrom(payload.sid),
      refreshTokenHash: this.hash(token),
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sign(
    payload: JWTPayload,
    userId: number,
    expiresInSeconds: number,
  ): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(userId))
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(this.secret);
  }

  private async verify(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      return payload;
    } catch (error: unknown) {
      if (this.isExpiredJwtError(error)) throw new DomainException(DomainErrorCode.EXPIRED_TOKEN);
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    }
  }

  private isExpiredJwtError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED';
  }

  private userIdFrom(payload: JWTPayload): number {
    const subjectId = this.subjectUserIdFrom(payload);
    const claimId = this.safePositiveInteger(payload.id);
    if (subjectId !== claimId) throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    return subjectId;
  }

  private subjectUserIdFrom(payload: JWTPayload): number {
    return this.safePositiveInteger(payload.sub);
  }

  private safePositiveInteger(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0)
      throw new DomainException(DomainErrorCode.WRONG_TOKEN);
    return parsed;
  }

  private roleFrom(value: unknown): UserRole {
    if (value === 'PENDING' || value === 'USER') return value;
    throw new DomainException(DomainErrorCode.WRONG_TOKEN);
  }

  private sessionIdFrom(value: unknown): string {
    if (typeof value === 'string' && value.length > 0) return value;
    throw new DomainException(DomainErrorCode.WRONG_TOKEN);
  }
}
