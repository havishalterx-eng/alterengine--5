import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Builder A found `pnpm lint` had been broken since Phase 0 — the script was
 * wired in package.json and no config was ever added. It failed before linting
 * anything, so it reported no violations and looked like it passed.
 *
 * A check that cannot fail is worse than no check: it occupies the slot a real
 * one would have taken.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Gates and build scripts are Node programs that report to a terminal.
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off', 'no-undef': 'off' },
  },
  {
    // Component CLIs (like identity's step-1 terminal surface) are the same
    // shape: programs whose product IS their stdout, read by a person.
    files: ['packages/*/src/cli.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
