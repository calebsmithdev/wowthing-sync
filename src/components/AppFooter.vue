<template>
  <footer class="text-slate-800 dark:text-slate-200 bg-gray-100 dark:bg-gray-900">
    <p>Version {{ appVersion }} | Built by <a href="https://raider.io/user/failcookie" target="_blank">Failcookie</a> | Powered by <a href="https://wowthing.org" target="_blank">WoWthing</a></p>
  </footer>
</template>

<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';

const appVersion = await getVersion();
</script>

<style scoped>
  footer {
    position: fixed;
    bottom: 0;
    width: 100%;
    height: 50px;
    padding: 0 20px;
    align-items: center;
    display: flex;
    justify-content: end;
    font-size: 70%;
  }

  a {
    text-decoration: underline;
  }
</style>