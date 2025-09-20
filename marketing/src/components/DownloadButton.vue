<template>
  <a :href="link" target="_blank" class="text-white bg-gray-900 hover:bg-gray-700 focus:ring-2 focus:ring-slate-200 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:text-white dark:focus:ring-slate-900 mt-3 w-full">
    {{ text }}
  </a>
</template>

<script setup lang="ts">
const props = defineProps({
  link: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
});
</script>
