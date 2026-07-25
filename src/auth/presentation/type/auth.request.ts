import { z } from 'zod';

export const appleLoginRequestSchema = z.object({ id_token: z.string().min(1) }).strict();
export type AppleLoginRequest = z.infer<typeof appleLoginRequestSchema>;

export const socialLoginRequestSchema = z.object({ token: z.string().min(1) }).strict();
export type SocialLoginRequest = z.infer<typeof socialLoginRequestSchema>;

export const providerParamsSchema = z.object({ provider: z.string().min(1) }).strict();
export type ProviderParams = z.infer<typeof providerParamsSchema>;
