import { z } from 'zod';

const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  APPLE_CLIENT_IDS: z.string().min(1),
  GOOGLE_CLIENT_IDS: z.string().min(1),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(env: Record<string, string | undefined>): AppEnv {
  return appEnvSchema.parse(env);
}
