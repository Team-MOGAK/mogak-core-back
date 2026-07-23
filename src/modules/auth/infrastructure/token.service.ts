import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AppEnv } from '../../../config/app-env';
import type { AuthenticatedUser, UserRole } from '../domain/authenticated-user';
import type { TokenPair } from '../domain/token-pair';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 31 * 24 * 60 * 60;
const CLOCK_TOLERANCE_SECONDS = 30;

type IssueTokenInput = Readonly<{
  userId: number;
  email?: string;
  role: UserRole;
  sessionId: string;
}>;

type RefreshTokenClaims = Readonly<{
  userId: number;
  sessionId: string;
}>;

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService<AppEnv, true>) {
    this.secret = new TextEncoder().encode(config.getOrThrow('JWT_SECRET', { infer: true }));
  }

  async issue(input: IssueTokenInput): Promise<TokenPair> {
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
      {
        token_type: REFRESH_TOKEN_TYPE,
        sid: input.sessionId,
      },
      input.userId,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    return { accessToken, refreshToken };
  }

  async verifyAccess(token: string): Promise<AuthenticatedUser> {
    const payload = await this.verify(token);
    if (payload.token_type !== ACCESS_TOKEN_TYPE) {
      throw new AppException(AppErrorCode.WRONG_TOKEN);
    }

    const userId = this.userIdFrom(payload);
    const role = this.roleFrom(payload.role);
    const sessionId = this.sessionIdFrom(payload.sid);
    const email = typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : undefined;

    return email === undefined ? { userId, role, sessionId } : { userId, email, role, sessionId };
  }

  async verifyRefresh(token: string): Promise<RefreshTokenClaims> {
    const payload = await this.verify(token);
    if (payload.token_type !== REFRESH_TOKEN_TYPE) {
      throw new AppException(AppErrorCode.WRONG_TOKEN);
    }

    return {
      userId: this.userIdFrom(payload),
      sessionId: this.sessionIdFrom(payload.sid),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sign(payload: JWTPayload, userId: number, expiresInSeconds: number): Promise<string> {
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
      if (this.isExpiredJwtError(error)) {
        throw new AppException(AppErrorCode.EXPIRED_TOKEN);
      }
      throw new AppException(AppErrorCode.WRONG_TOKEN);
    }
  }

  private isExpiredJwtError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED';
  }

  private userIdFrom(payload: JWTPayload): number {
    const subjectId = this.safePositiveInteger(payload.sub);
    const claimId = this.safePositiveInteger(payload.id);
    if (subjectId !== claimId) {
      throw new AppException(AppErrorCode.WRONG_TOKEN);
    }
    return subjectId;
  }

  private safePositiveInteger(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new AppException(AppErrorCode.WRONG_TOKEN);
    }
    return parsed;
  }

  private roleFrom(value: unknown): UserRole {
    if (value === 'PENDING' || value === 'USER') {
      return value;
    }
    throw new AppException(AppErrorCode.WRONG_TOKEN);
  }

  private sessionIdFrom(value: unknown): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    throw new AppException(AppErrorCode.WRONG_TOKEN);
  }
}
