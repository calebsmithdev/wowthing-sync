<template>
  <section id="features" class="container scroll-mt-8 py-20">
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="font-display text-3xl font-bold text-white sm:text-4xl">Log out. It's already uploaded.</h2>
      <p class="mt-4 text-slate-400">
        The WoWthing Collector addon saves your progress whenever a character logs out or reloads the UI. Wowthing Sync notices the change and sends it to WoWthing a moment later.
      </p>
    </div>

    <div class="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="feature in features" :key="feature.title" class="bg-ink p-7">
        <div class="flex size-10 items-center justify-center rounded-lg bg-linear-to-b from-amber-400/15 to-amber-700/10 text-amber-300 ring-1 ring-amber-500/30">
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="feature.icon" />
          </svg>
        </div>
        <h3 class="mt-5 font-semibold text-white">{{ feature.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed text-slate-400">{{ feature.body }}</p>
      </div>
    </div>

    <div class="mt-20 grid gap-8 md:grid-cols-3">
      <figure v-for="shot in screenshots" :key="shot.title" class="text-center">
        <img :src="shot.src" :alt="shot.alt" loading="lazy" class="w-full rounded-xl border border-white/10 shadow-2xl shadow-black/40">
        <figcaption class="mt-4 text-sm text-slate-400">
          <span class="font-semibold text-white">{{ shot.title }}</span>: {{ shot.caption }}
        </figcaption>
      </figure>
    </div>
  </section>
</template>

<script setup lang="ts">
import statusShot from '~/assets/images/status-dark.png';
import failureShot from '~/assets/images/failure-dark.png';
import settingsShot from '~/assets/images/settings-dark.png';

const features = [
  {
    title: 'Set it and forget it',
    body: 'Runs in the system tray and can start when you sign in. Changes upload a moment after the game finishes writing them.',
    icon: 'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'
  },
  {
    title: 'Every account at a glance',
    body: 'See when each account last uploaded. If one fails, the error and a Retry button appear right on that row.',
    icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'
  },
  {
    title: 'Sync Now, from anywhere',
    body: 'Trigger an upload from the window or the tray menu, which also shows the current sync status.',
    icon: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5'
  },
  {
    title: 'One notification per sync',
    body: 'Optional desktop notifications summarize the whole sync, like "Collector data uploaded for 3 accounts".',
    icon: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0'
  },
  {
    title: 'Secure by default',
    body: 'Your API key lives in Keychain, Windows Credential Manager or Secret Service, never in a plain-text file.',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'
  },
  {
    title: 'Stays current',
    body: 'Signed automatic updates, plus light and dark themes that follow your system.',
    icon: 'M12 3v12M7 10l5 5 5-5M5 21h14'
  }
];

const screenshots = [
  { src: statusShot, title: 'Status', caption: 'when each account last uploaded', alt: 'Status page showing three accounts and when each last synced' },
  { src: failureShot, title: 'Failures', caption: 'shown on the affected account, with Retry', alt: 'Status page with one account showing a failed upload and a Retry button' },
  { src: settingsShot, title: 'Settings', caption: 'API key, game folder and startup options', alt: 'Settings page with API key, game folder and general options' }
];
</script>
