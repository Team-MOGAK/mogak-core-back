import { z } from 'zod';

import { requiredTextSchema } from '@api/common/validation/requestSchema';

export const consentAgreementRequestSchema = z
  .object({ consentItemId: z.number().int().positive(), agreed: z.boolean() })
  .strict();
export type ConsentAgreementRequest = z.infer<typeof consentAgreementRequestSchema>;

export const nicknameRequestSchema = z.object({ nickname: requiredTextSchema(2, 10) }).strict();
export type NicknameRequest = z.infer<typeof nicknameRequestSchema>;

export const jobRequestSchema = z.object({ job: requiredTextSchema(1, 100) }).strict();
export type JobRequest = z.infer<typeof jobRequestSchema>;

export const joinUserRequestSchema = z
  .object({
    nickname: requiredTextSchema(2, 10),
    job: requiredTextSchema(1, 100),
    address: requiredTextSchema(1, 100),
    consents: z.array(consentAgreementRequestSchema).optional(),
  })
  .strict();
export type JoinUserRequest = z.infer<typeof joinUserRequestSchema>;
