import type { AuthenticatedPrincipal } from '../type/authenticated-principal';

export const SESSION_TOKEN_ISSUER = Symbol('SESSION_TOKEN_ISSUER');

export type IssuedSessionTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
}>;

export interface SessionTokenIssuerPort {
  issue(principal: AuthenticatedPrincipal): Promise<IssuedSessionTokens>;
}
