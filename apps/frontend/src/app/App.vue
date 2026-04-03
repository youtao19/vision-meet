<template>
  <main class="app-shell">
    <RouterView />
  </main>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: 24px;
  font-family:
    "IBM Plex Sans",
    "Noto Sans SC",
    "PingFang SC",
    "Hiragino Sans GB",
    sans-serif;
  background:
    radial-gradient(circle at 20% 10%, rgba(251, 191, 36, 0.18), transparent 36%),
    radial-gradient(circle at 85% 18%, rgba(14, 116, 144, 0.2), transparent 42%),
    linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
}
</style>
