<template>
  <div class="relative min-h-screen overflow-x-clip">
    <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(245,158,11,0.22),transparent)]" />

    <header class="container flex items-center justify-between py-5">
      <NuxtLink to="/" class="flex items-center gap-3 font-semibold text-white">
        <img src="~/assets/images/logo.png" alt="" class="size-9">
        Wowthing Sync
      </NuxtLink>
      <nav class="flex items-center gap-6 text-sm">
        <a href="#features" class="hidden hover:text-white sm:inline">Features</a>
        <a href="#setup" class="hidden hover:text-white sm:inline">Setup</a>
        <a href="#download" class="hidden hover:text-white sm:inline">Download</a>
        <a :href="repo" class="rounded-md border border-white/10 px-3 py-1.5 text-white transition hover:border-white/25 hover:bg-white/5">GitHub</a>
      </nav>
    </header>

    <slot />

    <footer class="border-t border-white/5">
      <div class="container flex flex-col gap-3 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Open source under the GPL-3.0 license.</p>
        <div class="flex gap-5">
          <a :href="`${repo}/releases`" class="hover:text-slate-300">Releases</a>
          <a :href="`${repo}/issues`" class="hover:text-slate-300">Report an issue</a>
          <a href="https://wowthing.org/" class="hover:text-slate-300">wowthing.org</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const repo = 'https://github.com/calebsmithdev/wowthing-sync';
</script>
