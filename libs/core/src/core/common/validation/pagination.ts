export const MAX_PAGE_SIZE = 100;

/**
 * Validate an offset-based page before it reaches a database adapter.
 * Keeping this check in core also protects callers that bypass the HTTP schema.
 */
export function pageOffset(page: number, size: number): number {
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_PAGE_SIZE
  ) {
    throw new RangeError('invalid page request');
  }

  const offset = page * size;
  if (!Number.isSafeInteger(offset)) throw new RangeError('page offset overflow');
  return offset;
}
