import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const config: Config = {
  ...createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/test/database/'],
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  restoreMocks: true,
};

export default config;
