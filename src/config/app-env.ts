import { z } from 'zod';

function parseCorsAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      let url: URL;

      try {
        url = new URL(origin);
      } catch {
        throw new Error('CORS_ALLOWED_ORIGINS에는 완전한 origin만 설정할 수 있습니다.');
      }

      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== origin) {
        throw new Error('CORS_ALLOWED_ORIGINS에는 완전한 origin만 설정할 수 있습니다.');
      }

      return origin;
    });
}

const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  APPLE_CLIENT_IDS: z.string().min(1),
  GOOGLE_CLIENT_IDS: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().optional().transform(parseCorsAllowedOrigins),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(env: Record<string, string | undefined>): AppEnv {
  return appEnvSchema.parse(env);
}
