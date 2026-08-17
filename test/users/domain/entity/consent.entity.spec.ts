import {
  validateConsentSelections,
  type ConsentItemForValidation,
} from '../../../../apps/api/src/core/users/domain/policy/consent.policy';

function consentItem(overrides: Partial<ConsentItemForValidation> = {}): ConsentItemForValidation {
  return {
    id: 1,
    required: false,
    active: true,
    ...overrides,
  };
}

describe('Consent domain rules', () => {
  it('rejects duplicate consent item IDs', () => {
    expect(
      validateConsentSelections(
        [
          { consentItemId: 1, agreed: true },
          { consentItemId: 1, agreed: false },
        ],
        [consentItem()],
      ),
    ).toBe('DUPLICATE_CONSENT_ITEM');
  });

  it('rejects an inactive selected item', () => {
    expect(
      validateConsentSelections(
        [{ consentItemId: 1, agreed: true }],
        [consentItem({ active: false })],
      ),
    ).toBe('CONSENT_ITEM_INACTIVE');
  });

  it('rejects an unagreed required active item', () => {
    expect(
      validateConsentSelections(
        [{ consentItemId: 1, agreed: false }],
        [consentItem({ required: true })],
      ),
    ).toBe('REQUIRED_CONSENT_NOT_AGREED');
  });
});
