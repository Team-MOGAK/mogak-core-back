export const SocialProvider = {
  APPLE: 'APPLE',
  GOOGLE: 'GOOGLE',
  KAKAO: 'KAKAO',
} as const;

export type SocialProvider = (typeof SocialProvider)[keyof typeof SocialProvider];
