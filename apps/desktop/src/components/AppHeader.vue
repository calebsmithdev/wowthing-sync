<template>
  <header class="border-b border-default">
    <div class="mx-auto flex w-full max-w-3xl items-center gap-2.5 pl-5 pr-3">
      <img src="/img/app-icon.png" alt="" width="24" height="24" class="size-6 rounded">
      <span class="text-sm font-semibold text-highlighted">WoWthing Sync</span>
      <UNavigationMenu :items="navigationItems" highlight variant="link" class="ml-auto" />
    </div>
  </header>
</template>

<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui';
import { computed } from 'vue';

const isDev = import.meta.dev;

const navigationItems = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: 'Status', to: '/' },
    { label: 'Settings', to: '/settings' },
  ];

  if (isDev) {
    items.push({ label: 'Debug', to: '/__debug' });
  }

  return items;
});
</script>
