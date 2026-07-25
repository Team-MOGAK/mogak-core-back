import { AppErrorCode } from '../http/app-error-code';
import { DomainException } from '../http/domain.exception';

export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainException(AppErrorCode.INVALID_PARAMETER);
  }
  return trimmed;
}
