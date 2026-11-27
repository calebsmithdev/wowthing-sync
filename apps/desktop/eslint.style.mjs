// Single source for formatting rules, shared by the Nuxt app (nuxt.config.ts)
// and the repository scripts (../../eslint.config.mjs). `eslint --fix` applies them.
/** @type {import('@stylistic/eslint-plugin').StylisticCustomizeOptions} */
export const stylisticOptions = {
  indent: 2,
  quotes: 'single',
  semi: false,
  arrowParens: false,
  braceStyle: '1tbs',
}

// The codebase deliberately keeps short guard/assign sequences on one line.
export const stylisticOverrides = {
  '@stylistic/max-statements-per-line': 'off',
  '@stylistic/multiline-ternary': 'off',
}

// Vue template layout follows the same dense style.
export const vueOverrides = {
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
}
