import { DomainErrorCode, DomainException } from '@core/common/error/domainException';

export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainException(DomainErrorCode.INVALID_PARAMETER);
  }
  return trimmed;
}
