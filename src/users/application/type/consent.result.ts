export type ConsentItemResult = Readonly<{
  id: number;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
}>;

export type MarketingConsentResult = Readonly<{
  marketingAgreed: boolean;
  advertisementAgreed: boolean;
}>;
