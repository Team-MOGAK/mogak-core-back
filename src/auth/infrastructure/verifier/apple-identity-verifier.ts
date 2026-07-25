import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { DomainException } from '../../../common/http/domain.exception';
import type { AppEnv } from '../../../config/app-env';
import type { SocialIdentityVerifier } from '../../application/port/social-identity-verifier.port';
import type { SocialProvider } from '../../domain/entity/auth.entity';
import { identityFromJwtClaims } from './identity-claims';

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

@Injectable()
export class AppleIdentityVerifier implements SocialIdentityVerifier {
  private readonly clientIds: string[];

  constructor(@Inject(ConfigService) config: ConfigService<AppEnv, true>) {
    this.clientIds = splitClientIds(config.getOrThrow('APPLE_CLIENT_IDS', { infer: true }));
  }

  supports(provider: SocialProvider): boolean {
    return provider === 'APPLE';
  }

  async verify(token: string) {
    try {
      const { payload } = await jwtVerify(token, appleKeys, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: this.clientIds,
        clockTolerance: 30,
      });
      return identityFromJwtClaims('APPLE', payload);
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
