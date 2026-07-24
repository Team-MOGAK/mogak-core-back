import { config as loadEnv } from 'dotenv';
import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const suppliedDatabaseUrl = process.env.DATABASE_URL;

loadEnv({ path: '.env', quiet: true });

if (suppliedDatabaseUrl === undefined) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl !== undefined) {
    const testDatabaseUrl = new URL(databaseUrl);
    testDatabaseUrl.pathname = '/mogak_test';
    process.env.DATABASE_URL = testDatabaseUrl.toString();
  }
}

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/database/**/*.spec.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  globalSetup: '<rootDir>/test/database/global-setup.ts',
  setupFiles: ['<rootDir>/test/database/setup.ts'],
  restoreMocks: true,
};

export default config;
