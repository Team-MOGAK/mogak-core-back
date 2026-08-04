export type ConsentItemResult = Readonly<{
  id: number;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
}>;

/** 동의 검증과 목록 응답에 필요한 활성 상태를 포함한 application 결과. */
export type ConsentItemState = ConsentItemResult & Readonly<{ active: boolean }>;

export type MarketingConsentResult = Readonly<{
  marketingAgreed: boolean;
  advertisementAgreed: boolean;
}>;
