<template>
  <section id="download" class="container scroll-mt-8 py-20">
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="font-display text-3xl font-bold text-white sm:text-4xl">Download Wowthing Sync</h2>
      <p class="mt-4 text-slate-400">
        Free and open source.<template v-if="version"> Latest version <a :href="releaseUrl" class="text-slate-200 hover:text-amber-400">{{ version }}</a>.</template> Once it's installed, the app updates itself.
      </p>
    </div>

    <div class="mt-14 grid gap-6 lg:grid-cols-3">
      <div
        v-for="platform in platforms"
        :key="platform.id"
        class="relative flex flex-col rounded-2xl border p-8 text-center transition"
        :class="detected === platform.id ? 'border-amber-400/50 bg-amber-400/[0.04] ring-1 ring-amber-400/30' : 'border-white/10 bg-white/[0.02] hover:border-white/20'"
      >
        <img :src="platform.logo" :alt="`${platform.name} logo`" class="mx-auto h-14 opacity-90 invert">
        <h3 class="mt-6 font-display text-xl font-semibold text-white">{{ platform.name }}</h3>
        <p class="mt-1 text-sm text-slate-500">{{ platform.note }}</p>
        <span v-if="detected === platform.id" class="absolute top-4 right-4 rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30">Your system</span>

        <div class="mt-auto pt-6">
          <div class="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <a
              v-for="(build, index) in platform.builds"
              :key="build.slug"
              :href="link(build.slug)"
              class="flex flex-1 flex-col items-center rounded-lg px-4 py-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              :class="index === 0 ? 'btn-gilded' : 'border border-white/15 text-white hover:bg-white/5'"
            >
              <span class="text-sm font-semibold">{{ build.label }}</span>
              <span v-if="detail(build.slug)" class="text-xs" :class="index === 0 ? 'text-slate-800' : 'text-slate-400'">{{ detail(build.slug) }}</span>
            </a>
          </div>

          <p class="mt-4 min-h-5 text-sm text-slate-500">
            <template v-if="extrasFor(platform).length">
              Also available as
              <template v-for="(extra, index) in extrasFor(platform)" :key="extra">
                <template v-if="index > 0"> or </template>
                <a :href="link(extra)" class="text-slate-300 hover:text-amber-400">{{ FILE_TYPES[extra] }}</a>
              </template>
            </template>
            <template v-else>{{ platform.hint }}</template>
          </p>
        </div>
      </div>
    </div>

    <p class="mt-10 text-center text-sm text-slate-500">
      On Linux, a keyring such as GNOME Keyring or KWallet must be running to store your API key. Older versions are on the
      <a href="https://github.com/calebsmithdev/wowthing-sync/releases" class="text-amber-400 hover:underline">Releases page</a>.
    </p>
  </section>
</template>

<script setup lang="ts">
import macLogo from '~/assets/images/macos-logo.svg';
import windowsLogo from '~/assets/images/windows-logo.svg';
import linuxLogo from '~/assets/images/linux-logo.svg';
import type { PlatformSlug } from '~/composables/useDownloads';

const { asset, link, version, releaseUrl, detected } = useDownloads();

const FILE_TYPES: Record<PlatformSlug, string> = {
  'mac-silicon': 'DMG',
  'mac-intel': 'DMG',
  windows: 'Installer',
  'windows-msi': 'MSI',
  linux: 'AppImage'
};

function detail(slug: PlatformSlug) {
  const file = asset(slug);
  if (!file) return null;
  return `${file.name.endsWith('.msi') ? 'MSI' : FILE_TYPES[slug]} · ${formatSize(file.size)}`;
}

// Skips extras that are missing or already offered as the main button (an MSI-only release).
function extrasFor(platform: { builds: { slug: PlatformSlug }[]; extras: PlatformSlug[] }) {
  const main = new Set(platform.builds.map(build => asset(build.slug)?.url));
  return platform.extras.filter(extra => asset(extra) && !main.has(asset(extra)?.url));
}

const platforms: { id: 'mac' | 'windows' | 'linux'; name: string; note: string; logo: string; builds: { slug: PlatformSlug; label: string }[]; extras: PlatformSlug[]; hint?: string }[] = [
  {
    id: 'mac',
    name: 'macOS',
    note: 'Apple Silicon and Intel',
    logo: macLogo,
    builds: [
      { slug: 'mac-silicon', label: 'Apple Silicon' },
      { slug: 'mac-intel', label: 'Intel' }
    ],
    extras: [],
    hint: 'Not sure? Apple menu → About This Mac.'
  },
  {
    id: 'windows',
    name: 'Windows',
    note: 'Windows 10 and 11, x64',
    logo: windowsLogo,
    builds: [{ slug: 'windows', label: 'Download for Windows' }],
    extras: ['windows-msi']
  },
  {
    id: 'linux',
    name: 'Linux',
    note: 'x64, including Steam Deck',
    logo: linuxLogo,
    builds: [{ slug: 'linux', label: 'Download for Linux' }],
    extras: [],
    hint: 'Make it executable, then run it. No install needed.'
  }
];
</script>
