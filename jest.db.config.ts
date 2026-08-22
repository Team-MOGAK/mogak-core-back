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
  roots: ['<rootDir>/apps/api/src', '<rootDir>/test'],
  testMatch: ['<rootDir>/test/database/**/*.integration.spec.ts'],
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/apps/api/src/api/$1',
    '^@core/(.*)$': '<rootDir>/apps/api/src/core/$1',
    '^@infra/(.*)$': '<rootDir>/apps/api/src/infrastructure/$1',
    '^@composition/(.*)$': '<rootDir>/apps/api/src/composition/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/database/setup.ts'],
  maxWorkers: 1,
  restoreMocks: true,
};

export default config;
