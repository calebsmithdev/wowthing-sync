// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  ssr: false,
  telemetry: false,
  ui: {
    primary: 'blue',
    gray: 'slate'
  },
  vite: {
    clearScreen: false,
    // Enable environment variables
    // Additional environment variables can be found at
    // https://tauri.app/2/reference/environment-variables/
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true,
      // Enables the development server to be discoverable by other devices for mobile development
      host: '0.0.0.0',
      hmr: {
        protocol: 'ws',
        host: '0.0.0.0',
        port: 5183,
      },
    },
  },
  srcDir: 'src/'
})
