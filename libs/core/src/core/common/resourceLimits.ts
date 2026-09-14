/** Upper bounds shared by request adapters and core services. */
export const MAX_PAGE_SIZE = 100;
export const MAX_DATE_RANGE_DAYS = 366;

export function isValidPageSize(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_PAGE_SIZE;
}

export function isSafePageOffset(page: number, size: number): boolean {
  return (
    Number.isSafeInteger(page) &&
    page >= 0 &&
    isValidPageSize(size) &&
    page <= Math.floor(Number.MAX_SAFE_INTEGER / size)
  );
}
