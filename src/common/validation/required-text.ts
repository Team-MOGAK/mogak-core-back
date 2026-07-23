import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';

export function requiredTrimmed(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  return trimmed;
}
