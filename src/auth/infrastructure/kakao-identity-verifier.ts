import { Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';
import type { SocialIdentity } from '../domain/social-identity';
import type { SocialIdentityVerifier } from '../domain/social-identity-verifier.port';
import type { SocialProvider } from '../domain/social-provider';

const kakaoUserInfoUrl = 'https://kapi.kakao.com/v2/user/me';

@Injectable()
export class KakaoIdentityVerifier implements SocialIdentityVerifier {
  supports(provider: SocialProvider): boolean {
    return provider === 'KAKAO';
  }

  async verify(token: string): Promise<SocialIdentity> {
    try {
      const response = await fetch(kakaoUserInfoUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
      }
      return this.identityFrom(await response.json());
    } catch (error: unknown) {
      if (error instanceof DomainException) {
        throw error;
      }
      throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }
  }

  private identityFrom(value: unknown): SocialIdentity {
    if (!isRecord(value) || (typeof value.id !== 'number' && typeof value.id !== 'string')) {
      throw new DomainException(AppErrorCode.INVALID_SOCIAL_TOKEN);
    }

    const account = isRecord(value.kakao_account) ? value.kakao_account : null;
    const email = account !== null && typeof account.email === 'string' ? account.email : null;
    const emailVerified =
      account !== null && account.is_email_valid === true && account.is_email_verified === true;

    return {
      provider: 'KAKAO',
      providerUserId: String(value.id),
      email,
      emailVerified,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
