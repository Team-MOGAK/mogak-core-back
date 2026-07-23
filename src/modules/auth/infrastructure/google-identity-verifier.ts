import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { AppEnv } from '../../../config/app-env';
import type { SocialIdentityVerifier } from '../domain/social-identity-verifier.port';
import type { SocialProvider } from '../domain/social-provider';
import { identityFromJwtClaims } from './identity-claims';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

@Injectable()
export class GoogleIdentityVerifier implements SocialIdentityVerifier {
  private readonly clientIds: string[];

  constructor(config: ConfigService<AppEnv, true>) {
    this.clientIds = splitClientIds(config.getOrThrow('GOOGLE_CLIENT_IDS', { infer: true }));
  }

  supports(provider: SocialProvider): boolean {
    return provider === 'GOOGLE';
  }

  async verify(token: string) {
    try {
      const { payload } = await jwtVerify(token, googleKeys, {
        algorithms: ['RS256'],
        issuer: 'https://accounts.google.com',
        audience: this.clientIds,
        clockTolerance: 30,
      });
      return identityFromJwtClaims('GOOGLE', payload);
    } catch (error: unknown) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }
  }
}

function splitClientIds(value: string): string[] {
  return value
    .split(',')
    .map((clientId) => clientId.trim())
    .filter((clientId) => clientId.length > 0);
}
