import tailwindcss from "@tailwindcss/vite";
import { defineNuxtConfig } from "nuxt/config";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  ssr: false,
  nitro: {
    externals: {
      // Keep renderer virtual modules in the bundle before Windows path resolution.
      inline: ['nuxt/internal/'],
    },
  },
  // A static palette replaces Nuxt UI's two runtime inline <style> insertions.
  hooks: {
    'app:resolve': (app) => {
      app.plugins = app.plugins.filter(plugin => !plugin.src.includes('/@nuxt/ui/dist/runtime/plugins/colors'))
    },
  },
  icon: {
    mode: 'svg',
    provider: 'none',
    clientBundle: { scan: true, icons: ['heroicons:eye', 'heroicons:eye-slash', 'lucide:loader-circle', 'lucide:check', 'lucide:chevron-down', 'lucide:external-link', 'lucide:circle-check', 'lucide:circle-alert'] },
  },
  telemetry: false,
  colorMode: {
    preference: 'dark'
  },
  app: {
    head: {
      title: 'WoWthing Sync',
      script: [
        { src: '/polyfills/disposable.js', tagPriority: 'critical' },
      ],
    },
    pageTransition: {
      name: 'fade',
      mode: 'out-in',
    },
    layoutTransition: {
      name: 'fade',
      mode: 'out-in',
    },
  },
  vite: {
    html: { cspNonce: process.env.TAURI_DEV_NONCE },
    build: {
      target: 'es2022',
    },
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    plugins: [
      tailwindcss()
    ],
    server: {
      strictPort: true,
      ws: {
        protocol: 'ws',
        host: '127.0.0.1',
        port: Number(process.env.TAURI_DEV_PORT ?? 3000) + 1,
      },
			watch: {
				ignored: ["**/src-tauri/**"]
			}
    },
  },
  css: [
    '~/assets/styles/main.css',
    '~/assets/styles/palette.css',
  ],
  devServer: {
		host: "127.0.0.1"
	},
  postcss: {
    plugins: {
      autoprefixer: {},
    },
  },
  compatibilityDate: "2024-10-01",
  srcDir: 'src/'
})
