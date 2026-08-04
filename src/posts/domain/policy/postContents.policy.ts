export type ContentsValidationResult =
  | Readonly<{ valid: true; value: string }>
  | Readonly<{ valid: false; reason: 'EMPTY' | 'TOO_LONG' }>;

export function validatePostContents(contents: string): ContentsValidationResult {
  return validateContents(contents, 350);
}

export function validateCommentContents(contents: string): ContentsValidationResult {
  return validateContents(contents, 200);
}

function validateContents(contents: string): ContentsValidationResult;
function validateContents(contents: string, maxLength: number): ContentsValidationResult;
function validateContents(contents: string, maxLength = 350): ContentsValidationResult {
  const trimmed = contents?.trim();
  if (trimmed === undefined || trimmed.length === 0) return { valid: false, reason: 'EMPTY' };
  if (trimmed.length > maxLength) return { valid: false, reason: 'TOO_LONG' };
  return { valid: true, value: trimmed };
}
