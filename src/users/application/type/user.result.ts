import type { TokenResult } from '../../../auth/application/type/auth.result';

export type JoinUserResult = Readonly<{ userId: number; nickname: string; tokens: TokenResult }>;
export type UserProfileProjection = Readonly<{
  nickname: string | null;
  job: string | null;
  profileImageKey: string | null;
}>;
export type UserProfileResult = Readonly<{
  nickname: string | null;
  job: string | null;
  imgUrl: string | null;
}>;
