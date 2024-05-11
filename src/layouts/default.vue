<template>
  <div class="main">
    <AppHeader />
    <main>
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.main {
  overflow: scroll;
  height: 91vh;
}
</style>