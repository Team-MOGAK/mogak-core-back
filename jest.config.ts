import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/test/database/.*\\.integration\\.spec\\.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  setupFiles: ['<rootDir>/test/fixtures/testEnv.fixture.ts'],
  restoreMocks: true,
};

export default config;
