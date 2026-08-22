import type { MergePatch } from '@core/common/type/mergePatch';

export type ConsentAgreementCommand = Readonly<{ consentItemId: number; agreed: boolean }>;

export type UpdateMarketingConsentCommand = MergePatch<
  Readonly<{ marketingAgreed: boolean; advertisementAgreed: boolean }>
>;
