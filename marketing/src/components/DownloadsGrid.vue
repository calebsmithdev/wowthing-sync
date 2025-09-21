<template>
  <div class="space-y-8 lg:grid lg:grid-cols-3 sm:gap-12 xl:gap-16 lg:space-y-0">
    <DownloadCard>
      <img src="~/assets/images/macos-logo.svg" alt="macOS Logo" class="h-20 mx-auto">
      <h3 class="mb-4 text-2xl font-semibold mt-8">macOS</h3>

      <div class="md:flex space-x-4">
        <DownloadButton :link="links.macIntel" text="Intel" />
        <DownloadButton :link="links.macSilicon" text="Apple Silicon" />
      </div>
    </DownloadCard>

    <DownloadCard>
      <img src="~/assets/images/windows-logo.svg" alt="Windows Logo" class="h-20 mx-auto">
      <h3 class="mb-4 text-2xl font-semibold mt-8">Windows</h3>

      <DownloadButton :link="links.windows" text="Windows 10 & Up" />
    </DownloadCard>

    <DownloadCard>
      <img src="~/assets/images/linux-logo.svg" alt="Linux Logo" class="h-20 mx-auto">
      <h3 class="mb-4 text-2xl font-semibold mt-8">Linux</h3>

      <DownloadButton :link="links.linux" text="AMD x64" />
    </DownloadCard>
  </div>
</template>

<script setup lang="ts">
  import { joinURL } from 'ufo';

  const runtimeConfig = useRuntimeConfig();

  const resolveLink = (path: string) => {
    const baseURL = runtimeConfig.app?.baseURL ?? '/';
    return joinURL(baseURL, path);
  };

  const links = computed(() => ({
    macIntel: resolveLink('/download/mac-intel'),
    macSilicon: resolveLink('/download/mac-silicon'),
    windows: resolveLink('/download/windows'),
    linux: resolveLink('/download/linux')
  }));
</script>
