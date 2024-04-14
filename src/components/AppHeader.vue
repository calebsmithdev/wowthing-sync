<template>
  <header class="border-b border-gray-200 dark:border-gray-800">
    <div class="logo">WoWthing Sync</div>
    <UHorizontalNavigation :links="links" />
  </header>
</template>

<script lang="ts" setup>
const links = [
  { label: 'Dashboard', to: '/' },
  { label: 'Logs', to: '/logs' },
  { label: 'Settings', to: '/settings' },
];
</script>

<style scoped>
header {
  display: flex;
  align-items: center;
}

.logo {
  white-space: nowrap;
  margin-bottom: 4px;
  font-size: 25px;
  user-select: none;
  padding: 10px 50px 10px 30px;
}
</style>