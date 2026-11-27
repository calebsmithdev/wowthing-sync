// Lint/format rules for the repository's Node scripts (../../scripts). Loaded
// through ../../eslint.config.mjs so dependencies resolve from this package.
import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import { stylisticOptions, stylisticOverrides } from './eslint.style.mjs'

export default [
  { ignores: ['apps/**', 'target/**', 'marketing/**', 'test-results/**', 'release-assets/**'] },
  {
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: js.configs.recommended.rules,
  },
  { files: ['scripts/**/*.mjs', '*.mjs'], ...stylistic.configs.customize(stylisticOptions) },
  { files: ['scripts/**/*.mjs', '*.mjs'], rules: {
    ...stylisticOverrides,
    'no-unused-vars': ['error', { caughtErrors: 'none', varsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Supervisors deliberately throw from finally so a failed process/fixture
    // cleanup is never masked by the primary result.
    'no-unsafe-finally': 'off',
  } },
]
