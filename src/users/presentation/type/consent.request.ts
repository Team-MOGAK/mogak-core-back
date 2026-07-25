import { z } from 'zod';

import { consentAgreementRequestSchema } from './users.request';

export const updateUserConsentRequestSchema = z
  .object({ consents: z.array(consentAgreementRequestSchema).optional() })
  .strict();
export type UpdateUserConsentRequest = z.infer<typeof updateUserConsentRequestSchema>;

export const updateMarketingConsentRequestSchema = z
  .object({ marketingAgreed: z.boolean().optional(), advertisementAgreed: z.boolean().optional() })
  .strict()
  .refine(
    (value) => value.marketingAgreed !== undefined || value.advertisementAgreed !== undefined,
  );
export type UpdateMarketingConsentRequest = z.infer<typeof updateMarketingConsentRequestSchema>;
