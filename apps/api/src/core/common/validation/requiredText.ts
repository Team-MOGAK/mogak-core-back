import { DomainErrorCode, DomainException } from '../error/domainException';

export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new DomainException(DomainErrorCode.INVALID_PARAMETER);
  return trimmed;
}

/** Preserves a missing PATCH field while validating a supplied required text value. */
export function patchText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : requiredTrimmed(value);
}
