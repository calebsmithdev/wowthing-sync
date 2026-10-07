<template>
  <main class="container flex justify-center py-28 text-center">
    <div class="max-w-lg space-y-5">
      <template v-if="file">
        <div class="mx-auto size-10 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400" aria-hidden="true" />
        <h1 class="text-3xl font-bold tracking-tight text-white">Your download is starting…</h1>
        <p class="text-slate-400">
          Downloading <span class="text-slate-200">{{ file.name }}</span> ({{ formatSize(file.size) }}).
          If nothing happens, <a :href="file.url" class="text-amber-400 hover:underline">download it directly</a>.
        </p>
      </template>
      <template v-else>
        <h1 class="text-3xl font-bold tracking-tight text-white">Download unavailable</h1>
        <p class="text-slate-400">
          {{ known ? "We couldn't find this download in the latest release." : 'Unknown download platform.' }}
          You can pick a file from the
          <a :href="releaseUrl" class="text-amber-400 hover:underline">latest release</a>.
        </p>
      </template>
      <NuxtLink to="/" class="inline-block rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5">
        Back to the homepage
      </NuxtLink>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { PlatformSlug } from '~/composables/useDownloads';

// Public routes kept stable for links in the README and elsewhere.
const ROUTES: readonly PlatformSlug[] = ['mac-silicon', 'mac-intel', 'windows', 'linux'];

const route = useRoute();
const { asset, releaseUrl } = useDownloads();

const slug = route.params.platform as string;
const known = (ROUTES as readonly string[]).includes(slug);
const file = known ? asset(slug as PlatformSlug) : null;

// Resolved at prerender time, so the redirect works without JavaScript.
if (file) {
  useHead({ meta: [{ 'http-equiv': 'refresh', content: `0; url=${file.url}` }] });
}
</script>
