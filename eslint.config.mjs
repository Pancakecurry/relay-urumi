import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['**/dist/**']},js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['tests/store/**/*.mjs'],
  languageOptions: {globals: {process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', AbortSignal: 'readonly'}}
}, {
  files: ['**/*.{ts,tsx}'],
  rules: { '@typescript-eslint/no-explicit-any': 'error' }
});
