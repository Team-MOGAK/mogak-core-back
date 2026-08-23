import type { SocialProvider } from './socialProvider.vo';

/** 공급자 토큰 검증 뒤에만 생성되는 신뢰 가능한 로그인 식별값. */
export type VerifiedSocialIdentity = Readonly<{
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}>;
