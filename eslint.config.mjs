import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'apps/*/dist/**', 'coverage/**', 'drizzle/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/src/**/*.ts', 'apps/alerting/test/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/alerting/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:http',
              message: 'Application code cannot depend on HTTP transport details.',
            },
            {
              name: 'node:buffer',
              message: 'Application code cannot depend on byte or HTTP body details.',
            },
            {
              name: '@google-cloud/firestore',
              message: 'Application code cannot depend on Firestore provider details.',
            },
            {
              name: '@google-cloud/pubsub',
              message: 'Application code cannot depend on Pub/Sub provider details.',
            },
          ],
          patterns: [
            {
              group: ['../presentation/**', '../infrastructure/**'],
              message: 'Application code cannot import presentation or infrastructure.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Buffer', message: 'Application code cannot depend on byte buffers.' },
        { name: 'process', message: 'Application code cannot depend on process globals.' },
        { name: 'require', message: 'Application code cannot use CommonJS loading.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='require']",
          message: 'Application code cannot use CommonJS loading.',
        },
        {
          selector: 'ImportExpression',
          message: 'Application code cannot use dynamic module loading.',
        },
      ],
    },
  },
  {
    files: ['apps/alerting/src/presentation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../infrastructure/**', '../../infrastructure/**'],
              message: 'Presentation code cannot import infrastructure adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/alerting/src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../presentation/**', '../../presentation/**'],
              message: 'Infrastructure code cannot import presentation adapters.',
            },
          ],
        },
      ],
    },
  },
);
