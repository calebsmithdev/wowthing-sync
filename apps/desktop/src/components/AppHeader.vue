<template>
  <UpdateBanner />
  <header class="border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900">
    <div class="mx-auto flex w-full max-w-5xl items-center gap-6 pl-6 pr-4 pt-2">
      <p class="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        WoWthing Sync
      </p>
      <div class="ml-auto">
        <UNavigationMenu
          :items="navigationItems"
          highlight
          variant="pill"
          class="justify-end"
        />
      </div>
    </div>
  </header>
</template>

<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui';
import { computed } from 'vue';

const isDev = import.meta.dev;

const navigationItems = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: 'Dashboard', to: '/' },
    { label: 'Settings', to: '/settings' },
  ];

  if (isDev) {
    items.push({ label: 'Debug', to: '/__debug' });
  }

  return items;
});
</script>
