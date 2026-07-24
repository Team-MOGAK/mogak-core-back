export type UserRole = 'PENDING' | 'USER';

export type AuthenticatedUser = Readonly<{
  userId: number;
  email?: string;
  role: UserRole;
  sessionId: string;
}>;
