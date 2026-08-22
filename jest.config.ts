import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/test'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/test/database/.*\\.integration\\.spec\\.ts'],
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/apps/api/src/api/$1',
    '^@core/(.*)$': '<rootDir>/apps/api/src/core/$1',
    '^@infra/(.*)$': '<rootDir>/apps/api/src/infrastructure/$1',
    '^@composition/(.*)$': '<rootDir>/apps/api/src/composition/$1',
  },
  setupFiles: ['<rootDir>/test/fixtures/testEnv.fixture.ts'],
  restoreMocks: true,
};

export default config;
