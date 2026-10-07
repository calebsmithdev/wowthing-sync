<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-3xl flex-1 space-y-4 px-5 py-4">
      <UpdateBanner />
      <SyncStatusBanner />
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
