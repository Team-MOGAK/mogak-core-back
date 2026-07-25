import type { AuthenticatedPrincipal } from '../type/authenticated-principal';

export const AUTH_TOKEN_VERIFIER = Symbol('AUTH_TOKEN_VERIFIER');

export type VerifiedRefreshToken = Readonly<{
  userId: number;
  sessionId: string;
  refreshTokenHash: string;
}>;

export interface AuthTokenVerifierPort {
  verifyAccess(token: string): Promise<AuthenticatedPrincipal>;
  verifyRefresh(token: string): Promise<VerifiedRefreshToken>;
}
