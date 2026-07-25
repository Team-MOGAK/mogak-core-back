import {
  validateConsentSelections,
  type ConsentItem,
} from '../../../../src/users/domain/entity/consent.entity';

const now = new Date('2026-07-25T00:00:00.000Z');

function consentItem(overrides: Partial<ConsentItem> = {}): ConsentItem {
  return {
    id: 1,
    code: 'TERMS',
    name: '서비스 이용약관',
    description: null,
    required: false,
    active: true,
    createdAt: now,
    updatedAt: now,
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
