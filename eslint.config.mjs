import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**', '**/.next/**', '**/node_modules/**', '**/prisma/generated/**',
      'assets/**', 'scripts/**', '**/*.config.*', '**/*.spec.ts', '**/*.test.ts',
      // Aplikacje Next.js lintowane osobno przez `next lint` (własne reguły).
      'apps/configurator/**', 'apps/admin/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: false } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
);
