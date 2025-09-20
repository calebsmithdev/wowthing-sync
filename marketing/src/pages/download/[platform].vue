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

const GITHUB_RELEASE_URL = 'https://api.github.com/repos/calebsmithdev/wowthing-sync/releases/latest';

const ASSET_PATTERNS = {
  'mac-intel': /Wowthing\.Sync_x64\.app\.tar\.gz$/,
  'mac-silicon': /Wowthing\.Sync_aarch64\.app\.tar\.gz$/,
  windows: /Wowthing\.Sync_[^_]+_x64_en-US\.msi\.zip$/,
  linux: /Wowthing\.Sync_[^_]+_amd64\.AppImage$/
} as const;

type PlatformSlug = keyof typeof ASSET_PATTERNS;

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  assets: GithubReleaseAsset[];
}

const status = ref<'loading' | 'error'>('loading');
const errorMessage = ref('');

function isKnownPlatform(value: string | undefined): value is PlatformSlug {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ASSET_PATTERNS, value)
  );
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
    const release = await $fetch<GithubRelease>(GITHUB_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json'
      }
    });

    const downloadUrl = release.assets
      ?.find((asset) => ASSET_PATTERNS[slug].test(asset.name))
      ?.browser_download_url;

    if (!downloadUrl) {
      status.value = 'error';
      errorMessage.value = 'Download is not available right now. Please try again later.';
      return;
    }

    window.location.href = downloadUrl;
  } catch (error) {
    console.error('Failed to fetch release info', error);
    status.value = 'error';
    errorMessage.value = 'Unable to reach the download server. Please try again in a moment.';
  }
}

onMounted(() => {
  redirectToDownload(route.params.platform as string | undefined);
});
</script>
