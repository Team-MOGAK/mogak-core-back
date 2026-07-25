export type ConsentAgreementCommand = Readonly<{ consentItemId: number; agreed: boolean }>;

export type UpdateMarketingConsentCommand = Readonly<{
  marketingAgreed?: boolean;
  advertisementAgreed?: boolean;
}>;
