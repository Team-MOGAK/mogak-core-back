import type { SocialLoginResult, TokenResult } from '@core/auth/application/type/auth.result';

export type LoginResponse = SocialLoginResult;
export type RefreshResponse = TokenResult;
export type LogoutResponse = Record<string, never>;
