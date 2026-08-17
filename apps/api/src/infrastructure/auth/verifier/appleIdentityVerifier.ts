import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { SocialIdentityVerifier } from '@core/auth/application/port/socialIdentityVerifier.port';
import type { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import { identityFromJwtClaims } from './identityClaims';

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

@Injectable()
export class AppleIdentityVerifier implements SocialIdentityVerifier {
  private readonly clientIds: string[];

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.clientIds = splitClientIds(
      config.get<string>('APPLE_CLIENT_IDS') ?? config.getOrThrow<string>('APPLE_CLIENT_ID'),
    );
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
      throw new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN);
    }
  }
}

function splitClientIds(value: string): string[] {
  return value
    .split(',')
    .map((clientId) => clientId.trim())
    .filter((clientId) => clientId.length > 0);
}
