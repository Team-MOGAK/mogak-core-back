import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/database/**/*.spec.ts'],
    globalSetup: ['./test/database/global-setup.ts'],
    setupFiles: ['./test/database/setup.ts'],
    restoreMocks: true,
  },
});
