import tailwindcss from "@tailwindcss/vite";
import { fetchDownloads } from './scripts/release-assets.mjs';

// Download links are resolved once at build time, so the static site links straight
// to installers. CI must not deploy a page with missing links; local builds just warn.
async function loadRelease() {
  const tag = process.env.WOWTHING_RELEASE_TAG || undefined;
  try {
    const release = await fetchDownloads({ tag, token: process.env.GITHUB_TOKEN });
    if (release.missing.length) throw new Error(`Release ${release.version} has no installer for: ${release.missing.join(', ')}`);
    return release;
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn('[downloads] Falling back to the Releases page:', error instanceof Error ? error.message : error);
    return null;
  }
}

const release = await loadRelease();

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: 'src/',
  compatibilityDate: '2024-11-01',
  css: [
    '~/assets/css/tailwind.css'
  ],
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
    head: {
      htmlAttrs: { lang: 'en', class: 'scroll-smooth' },
      title: 'Wowthing Sync: keep WoWthing up to date automatically',
      meta: [
        { name: 'description', content: 'A small desktop app for macOS, Windows and Linux that uploads your WoWthing Collector addon data each time you log out.' },
        { name: 'theme-color', content: '#0b1120' },
        { property: 'og:title', content: 'Wowthing Sync' },
        { property: 'og:description', content: 'Keep WoWthing up to date without opening a browser.' }
      ]
    }
  },
  runtimeConfig: {
    public: {
      // Serialized so the generated runtime config type stays a plain string.
      release: JSON.stringify(release)
    }
  },
  vite: {
    plugins: [
      tailwindcss()
    ],
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
