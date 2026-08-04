export type RegistrationRole = 'PENDING' | 'USER';

export function canCompleteRegistration(
  principalRole: RegistrationRole,
  persistedRole: RegistrationRole,
): boolean {
  return principalRole === 'PENDING' && persistedRole === 'PENDING';
}

export function normalizeNickname(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}
