import type { SocialLoginResult, TokenResult } from '../../application/type/auth.result';

export type LoginResponse = SocialLoginResult;
export type RefreshResponse = TokenResult;
export type LogoutResponse = Record<string, never>;
export type WithdrawResponse = Readonly<{ isDeleted: true }>;
