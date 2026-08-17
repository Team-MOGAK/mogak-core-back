import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { Injectable } from '@nestjs/common';

import type { SocialIdentityVerifier } from '@core/auth/application/port/socialIdentityVerifier.port';
import type { SocialProvider } from '@core/auth/domain/vo/socialProvider.vo';
import type { VerifiedSocialIdentity } from '@core/auth/domain/vo/verifiedSocialIdentity.vo';

const kakaoUserInfoUrl = 'https://kapi.kakao.com/v2/user/me';

@Injectable()
export class KakaoIdentityVerifier implements SocialIdentityVerifier {
  supports(provider: SocialProvider): boolean {
    return provider === 'KAKAO';
  }

  async verify(token: string): Promise<VerifiedSocialIdentity> {
    try {
      const response = await fetch(kakaoUserInfoUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN);
      return this.identityFrom(await response.json());
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN);
    }
  }

  private identityFrom(value: unknown): VerifiedSocialIdentity {
    if (!isRecord(value) || (typeof value.id !== 'number' && typeof value.id !== 'string')) {
      throw new DomainException(DomainErrorCode.INVALID_SOCIAL_TOKEN);
    }
    const account = isRecord(value.kakao_account) ? value.kakao_account : null;
    const email = account !== null && typeof account.email === 'string' ? account.email : null;
    return {
      provider: 'KAKAO',
      providerUserId: String(value.id),
      email,
      emailVerified:
        account !== null && account.is_email_valid === true && account.is_email_verified === true,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
