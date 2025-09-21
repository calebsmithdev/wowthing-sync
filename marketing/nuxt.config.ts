import Lara from '@primevue/themes/lara';
import tailwindcss from "@tailwindcss/vite";

const downloadManifestRaw = process.env.NUXT_DOWNLOAD_MANIFEST;
let downloadManifest: unknown = null;

if (downloadManifestRaw) {
  try {
    downloadManifest = JSON.parse(downloadManifestRaw);
  } catch (error) {
    console.warn('Failed to parse NUXT_DOWNLOAD_MANIFEST env variable', error);
  }
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: 'src/',
  compatibilityDate: '2024-11-01',
  css: [
    '~/assets/css/tailwind.css'
  ],
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/'
  },
  runtimeConfig: {
    public: {
      downloadManifest
    }
  },
  modules: [
    '@primevue/nuxt-module'
  ],
  postcss: {
    plugins: {
      autoprefixer: {},
    }
  },
  vite: {
    plugins: [
      tailwindcss()
    ],
  },
  primevue: {
    options: {
      theme: {
        preset: Lara,
        options: {
          cssLayer: {
            name: 'primevue',
            order: 'tailwind-base, primevue, tailwind-utilities'
          }
        }
      }
    }
  },
  nitro: {
    prerender: {
      routes: [
        '/download/mac-intel',
        '/download/mac-silicon',
        '/download/windows',
        '/download/linux'
      ]
    }
  },
  devtools: { enabled: true }
})
