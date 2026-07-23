import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/database/**/*.spec.ts'],
    setupFiles: ['./test/database/setup.ts'],
    restoreMocks: true,
  },
});
