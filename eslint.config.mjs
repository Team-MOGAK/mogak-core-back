import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'apps/*/dist/**', 'libs/*/dist/**', 'coverage/**', 'drizzle/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['apps/**/src/**/*.ts', 'apps/alerting/test/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
