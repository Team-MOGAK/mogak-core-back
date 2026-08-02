import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { AppErrorCode } from '../../../common/http/appErrorCode';
import { DomainException } from '../../../common/http/domain.exception';
import type { AppEnv } from '../../../config/appEnv';
import type { SocialIdentityVerifier } from '../../application/port/socialIdentityVerifier.port';
import type { SocialProvider } from '../../domain/entity/auth.entity';
import { identityFromJwtClaims } from './identityClaims';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

@Injectable()
export class GoogleIdentityVerifier implements SocialIdentityVerifier {
  private readonly clientIds: string[];

  constructor(@Inject(ConfigService) config: ConfigService<AppEnv, true>) {
    this.clientIds = splitClientIds(config.getOrThrow('GOOGLE_CLIENT_IDS', { infer: true }));
  }

  supports(provider: SocialProvider): boolean {
    return provider === 'GOOGLE';
  }

  async verify(token: string) {
    try {
      const { payload } = await jwtVerify(token, googleKeys, {
        algorithms: ['RS256'],
        issuer: [...GOOGLE_ISSUERS],
        audience: this.clientIds,
        clockTolerance: 30,
      });
      return identityFromJwtClaims('GOOGLE', payload);
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }
  }
}

function splitClientIds(value: string): string[] {
  return value
    .split(',')
    .map((clientId) => clientId.trim())
    .filter((clientId) => clientId.length > 0);
}
