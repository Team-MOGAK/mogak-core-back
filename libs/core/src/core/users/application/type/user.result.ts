import type { TokenResult } from '@core/auth/application/type/auth.result';
import type { RegistrationRole } from '../../domain/policy/userRegistration.policy';

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

/** 가입 완료 흐름이 필요로 하는 최소 사용자 상태. */
export type RegistrationCandidate = Readonly<{
  id: number;
  email: string | null;
  role: RegistrationRole;
}>;
