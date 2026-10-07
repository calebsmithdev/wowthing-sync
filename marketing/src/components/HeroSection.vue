<template>
  <section class="container pt-12 pb-20 text-center lg:pt-20">
    <a v-if="version" :href="releaseUrl" class="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300 transition hover:border-amber-400/40">
      <span class="size-1.5 rounded-full bg-amber-400" />
      Version {{ version }}<template v-if="publishedAt"> · {{ publishedAt }}</template>
      <span aria-hidden="true">→</span>
    </a>
    <h1 class="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance text-white sm:text-6xl">
      Keep WoWthing up to date <span class="text-amber-400">without opening a browser</span>
    </h1>
    <p class="mx-auto mt-6 max-w-2xl text-lg text-pretty text-slate-400">
      A small desktop app that uploads your WoWthing Collector addon data each time you log out. Set it up once and it runs quietly in your system tray.
    </p>

    <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <a :href="primary.href" class="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
        <svg class="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.61L6.3 8.24a.75.75 0 1 0-1.1 1.02l4.25 4.5a.75.75 0 0 0 1.1 0l4.25-4.5a.75.75 0 0 0-1.1-1.02l-2.95 3.12V2.75Z" /><path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" /></svg>
        {{ primary.label }}
      </a>
      <a href="#download" class="rounded-lg px-5 py-3 font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
        {{ detected ? 'Other platforms' : 'All platforms' }}
      </a>
    </div>
    <p v-if="detected === 'mac'" class="mt-4 text-sm text-slate-500">
      For Apple Silicon. On an Intel Mac? <a :href="link('mac-intel')" class="text-amber-400 hover:underline">Download the Intel build</a>.
    </p>
    <p v-else class="mt-4 text-sm text-slate-500">Free for macOS, Windows and Linux. Updates itself.</p>

    <img
      src="~/assets/images/hero-dark.png"
      alt="Wowthing Sync status and settings windows"
      width="2560"
      height="1520"
      class="mx-auto mt-16 w-full max-w-5xl rounded-2xl shadow-2xl shadow-amber-950/30 ring-1 ring-white/10"
    >
  </section>
</template>

<script setup lang="ts">
const { link, version, releaseUrl, publishedAt, detected } = useDownloads();

const primary = computed(() => {
  switch (detected.value) {
    case 'mac': return { href: link('mac-silicon'), label: 'Download for macOS' };
    case 'windows': return { href: link('windows'), label: 'Download for Windows' };
    case 'linux': return { href: link('linux'), label: 'Download for Linux' };
    default: return { href: '#download', label: 'Download' };
  }
});
</script>
