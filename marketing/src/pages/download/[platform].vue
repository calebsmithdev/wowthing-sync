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
const runtimeConfig = useRuntimeConfig();

const PLATFORM_MAP = {
  'mac-intel': 'darwin-x86_64',
  'mac-silicon': 'darwin-aarch64',
  windows: 'windows-x86_64',
  linux: 'linux-x86_64'
} as const;

type PlatformSlug = keyof typeof PLATFORM_MAP;

interface ReleaseManifestPlatform {
  url: string;
}

interface ReleaseManifest {
  platforms?: Record<string, ReleaseManifestPlatform>;
}

const manifest = computed<ReleaseManifest | null>(() => {
  return (runtimeConfig.public.downloadManifest as ReleaseManifest | null) ?? null;
});

const status = ref<'loading' | 'error'>('loading');
const errorMessage = ref('');

function isKnownPlatform(value: string | undefined): value is PlatformSlug {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PLATFORM_MAP, value)
  );
}

function resolveDownloadUrl(slug: PlatformSlug): string | null {
  const manifestKey = PLATFORM_MAP[slug];
  const url = manifest.value?.platforms?.[manifestKey]?.url;
  return url ?? null;
}

function handleError(message: string) {
  status.value = 'error';
  errorMessage.value = message;
}

function redirectToDownload(slug: string | undefined) {
  status.value = 'loading';
  errorMessage.value = '';

  if (!isKnownPlatform(slug)) {
    handleError('Unknown download platform. Please pick a link from the downloads page.');
    return;
  }

  if (!manifest.value) {
    handleError('Download info is not available right now. Please try again later.');
    return;
  }

  const downloadUrl = resolveDownloadUrl(slug);

  if (!downloadUrl) {
    handleError('Download is not available right now. Please try again later.');
    return;
  }

  window.location.href = downloadUrl;
}

onMounted(() => {
  redirectToDownload(route.params.platform as string | undefined);
});
</script>
