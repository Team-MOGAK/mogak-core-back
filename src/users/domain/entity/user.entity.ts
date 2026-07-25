export type UserRole = 'PENDING' | 'USER';

/** A row from the `users` table. */
export type User = Readonly<{
  id: number;
  jobId: number | null;
  addressId: number | null;
  nickname: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  role: UserRole;
  profileImageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export function canCompleteRegistration(principalRole: UserRole, persistedRole: UserRole): boolean {
  return principalRole === 'PENDING' && persistedRole === 'PENDING';
}

export function normalizeNickname(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}
