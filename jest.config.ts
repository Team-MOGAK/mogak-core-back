import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/libs', '<rootDir>/test'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/test/database/.*\\.integration\\.spec\\.ts'],
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/apps/api/src/api/$1',
    '^@core/(.*)$': '<rootDir>/libs/core/src/core/$1',
    '^@mogak/core$': '<rootDir>/libs/core/src/index.ts',
    '^@infra/(.*)$': '<rootDir>/libs/modules/src/infrastructure/$1',
    '^@mogak/modules/(.*)$': '<rootDir>/libs/modules/src/$1',
  },
  setupFiles: ['<rootDir>/test/fixtures/testEnv.fixture.ts'],
  restoreMocks: true,
};

export default config;
