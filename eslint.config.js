import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['node_modules/', '**/.claude-plugin/types/', 'package-lock.json'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      // Mods run inside Claude Code, which provides the timing and console globals.
      globals: { console: 'readonly', performance: 'readonly' },
    },
    rules: {
      // `for (const _ of …)` counts matches without using them; a leading underscore marks that on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The test kit hands each test an untyped `$` and `on`.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  // Turns off every rule that would fight Prettier over formatting. Keep it last.
  prettier,
)
