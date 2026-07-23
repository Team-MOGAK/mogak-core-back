import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: '.env.test', quiet: true });

export default defineConfig({
  test: {
    include: ['test/database/**/*.spec.ts'],
    globalSetup: ['./test/database/global-setup.ts'],
    setupFiles: ['./test/database/setup.ts'],
    restoreMocks: true,
  },
});
