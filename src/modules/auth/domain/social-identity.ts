import type { SocialProvider } from './social-provider';

export type SocialIdentity = Readonly<{
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}>;
