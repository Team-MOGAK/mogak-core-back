export type RegistrationRole = 'PENDING' | 'USER';

export type RegistrationSnapshot = Readonly<{
  nickname: string | null;
  jobId: number | null;
  addressId: number | null;
  requiredConsentAgreements: readonly boolean[];
}>;

export function canCompleteRegistration(
  principalRole: RegistrationRole,
  persistedRole: RegistrationRole,
): boolean {
  return principalRole === 'PENDING' && persistedRole === 'PENDING';
}

export function normalizeNickname(value: string): string | null {
  const normalized = value.trim();
  return normalized.length < 2 || normalized.length > 10 ? null : normalized;
}

export function registrationRoleFor(snapshot: RegistrationSnapshot): RegistrationRole {
  return snapshot.nickname !== null &&
    normalizeNickname(snapshot.nickname) !== null &&
    snapshot.jobId !== null &&
    snapshot.addressId !== null &&
    snapshot.requiredConsentAgreements.every((agreed) => agreed)
    ? 'USER'
    : 'PENDING';
}
