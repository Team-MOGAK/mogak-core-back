export type UserRole = 'PENDING' | 'USER';

export type AuthenticatedPrincipal = Readonly<{
  userId: number;
  email?: string;
  role: UserRole;
  sessionId: string;
}>;
