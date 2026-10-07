import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['dist/**', 'src-tauri/**', 'public/polyfills/**', 'playwright-report/**', 'test-results/**'],
}, {
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-invalid-void-type': ['error', { allowInGenericTypeArguments: true }],
  },
})
