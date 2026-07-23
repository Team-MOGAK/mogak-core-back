import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const suppliedDatabaseUrl = process.env.DATABASE_URL;

config({ path: '.env', quiet: true });

if (suppliedDatabaseUrl === undefined) {
  const databaseUrl = process.env.DATABASE_URL;
  const testDatabaseName = process.env.MOGAK_TEST_DB;
  if (databaseUrl !== undefined && testDatabaseName !== undefined) {
    const testDatabaseUrl = new URL(databaseUrl);
    testDatabaseUrl.pathname = `/${testDatabaseName}`;
    process.env.DATABASE_URL = testDatabaseUrl.toString();
  }
}

export default defineConfig({
  test: {
    include: ['test/database/**/*.spec.ts'],
    globalSetup: ['./test/database/global-setup.ts'],
    setupFiles: ['./test/database/setup.ts'],
    restoreMocks: true,
  },
});
