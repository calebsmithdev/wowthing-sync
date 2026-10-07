<template>
  <section id="setup" class="scroll-mt-8 border-y border-white/5 bg-white/[0.02] py-20">
    <div class="container">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Set up in a couple of minutes</h2>
        <p class="mt-4 text-slate-400">You only do this once. After that, just play.</p>
      </div>

      <ol class="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="(step, index) in steps" :key="step.title" class="relative rounded-xl border border-white/10 bg-ink p-6">
          <span class="flex size-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-950">{{ index + 1 }}</span>
          <h3 class="mt-4 font-semibold text-white">{{ step.title }}</h3>
          <!-- eslint-disable-next-line vue/no-v-html -- static, trusted copy -->
          <p class="mt-2 text-sm leading-relaxed text-slate-400 [&_a]:text-amber-400 [&_a:hover]:underline [&_b]:text-slate-200 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:text-slate-200" v-html="step.body" />
        </li>
      </ol>
    </div>
  </section>
</template>

<script setup lang="ts">
const steps = [
  {
    title: 'Install the addon',
    body: 'Add <a href="https://www.curseforge.com/wow/addons/wowthing-collector">WoWthing Collector</a> to your retail game with your addon manager of choice.'
  },
  {
    title: 'Copy your API key',
    body: 'Sign in to <a href="https://wowthing.org/">wowthing.org</a>, open <b>Settings → Account</b> and copy your API key.'
  },
  {
    title: 'Connect the app',
    body: 'In Wowthing Sync, open <b>Settings</b>, paste the key and pick your <code>_retail_</code> folder, or use the default location.'
  },
  {
    title: 'Play',
    body: 'Log out of a character or <code>/reload</code>. A few seconds later, its account appears under <b>Status</b> with an upload time.'
  }
];
</script>
