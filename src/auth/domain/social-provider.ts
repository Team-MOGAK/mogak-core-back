import { AppErrorCode } from '../../common/http/app-error-code';
import { DomainException } from '../../common/http/domain.exception';

export const socialProviders = ['APPLE', 'GOOGLE', 'KAKAO'] as const;

export type SocialProvider = (typeof socialProviders)[number];

export function parseSocialProvider(value: string): SocialProvider {
  const provider = value.toUpperCase();
  if (provider === 'APPLE' || provider === 'GOOGLE' || provider === 'KAKAO') {
    return provider;
  }
  throw new DomainException(AppErrorCode.UNSUPPORTED_SOCIAL_PROVIDER);
}
