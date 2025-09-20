<template>
  <div class="min-h-screen flex items-center justify-center px-6 text-center">
    <div class="max-w-lg space-y-4">
      <h1 class="text-3xl font-semibold">Preparing your download…</h1>
      <p v-if="status === 'loading'">Hang tight while we grab the latest build for your platform.</p>
      <p v-else class="text-red-500">{{ errorMessage }}</p>
      <NuxtLink to="/" class="text-primary underline">Return to homepage</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const RELEASE_MANIFEST_URL = 'https://github.com/calebsmithdev/wowthing-sync/releases/latest/download/latest.json';

const PLATFORM_MAP = {
  'mac-intel': 'darwin-x86_64',
  'mac-silicon': 'darwin-aarch64',
  windows: 'windows-x86_64',
  linux: 'linux-x86_64'
} as const;

type PlatformSlug = keyof typeof PLATFORM_MAP;

interface ReleaseManifest {
  platforms: Record<string, { url: string }>;
}

const status = ref<'loading' | 'error'>('loading');
const errorMessage = ref('');

function isKnownPlatform(value: string | undefined): value is PlatformSlug {
  return !!value && value in PLATFORM_MAP;
}

async function redirectToDownload(slug: string | undefined) {
  status.value = 'loading';
  errorMessage.value = '';

  if (!isKnownPlatform(slug)) {
    status.value = 'error';
    errorMessage.value = 'Unknown download platform. Please pick a link from the downloads page.';
    return;
  }

  try {
    const manifest = await $fetch<ReleaseManifest>(RELEASE_MANIFEST_URL, { responseType: 'json' });
    const downloadUrl = manifest.platforms?.[PLATFORM_MAP[slug]]?.url;

    if (!downloadUrl) {
      status.value = 'error';
      errorMessage.value = 'Download is not available right now. Please try again later.';
      return;
    }

    window.location.href = downloadUrl;
  } catch (error) {
    console.error('Failed to fetch release manifest', error);
    status.value = 'error';
    errorMessage.value = 'Unable to reach the download server. Please try again in a moment.';
  }
}

onMounted(() => {
  redirectToDownload(route.params.platform as string | undefined);
});
</script>
