import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['test/database/**'],
    setupFiles: ['./test/setup-env.ts'],
    restoreMocks: true,
  },
});
