import type { AuthenticatedPrincipal } from '../type/authenticated-principal';
import type { TokenResult } from '../type/auth.result';

export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');

export type RefreshTokenPrincipal = Readonly<{ userId: number; sessionId: string }>;

export interface TokenIssuerPort {
  issue(input: AuthenticatedPrincipal): Promise<TokenResult>;
  verifyAccess(token: string): Promise<AuthenticatedPrincipal>;
  verifyRefresh(token: string): Promise<RefreshTokenPrincipal>;
  hashRefreshToken(token: string): string;
}
