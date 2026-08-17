import { DomainException } from '../error/domainException';

export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new DomainException('INVALID_PARAMETER');
  return trimmed;
}
