/** A row from the `consent_items` table. */
export type ConsentItem = Readonly<{
  id: number;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

/** A row from the `user_consents` table. */
export type UserConsent = Readonly<{
  id: number;
  userId: number;
  consentItemId: number;
  agreed: boolean;
  agreedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ConsentSelection = Readonly<{ consentItemId: number; agreed: boolean }>;

export type ConsentValidationIssue =
  'DUPLICATE_CONSENT_ITEM' | 'CONSENT_ITEM_INACTIVE' | 'REQUIRED_CONSENT_NOT_AGREED';

export function validateConsentSelections(
  selections: readonly ConsentSelection[],
  items: readonly ConsentItem[],
): ConsentValidationIssue | null {
  const ids = selections.map((selection) => selection.consentItemId);
  if (new Set(ids).size !== ids.length) return 'DUPLICATE_CONSENT_ITEM';
  if (items.some((item) => !item.active)) return 'CONSENT_ITEM_INACTIVE';

  const agreedByItemId = new Map(
    selections.map((selection) => [selection.consentItemId, selection.agreed]),
  );
  return items.some((item) => item.required && agreedByItemId.get(item.id) !== true)
    ? 'REQUIRED_CONSENT_NOT_AGREED'
    : null;
}
