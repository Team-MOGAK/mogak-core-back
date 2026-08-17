import { CoreError } from '../error/coreError';

export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new CoreError('INVALID_PARAMETER');
  return trimmed;
}
