<template>
  <section class="dashboard-page">
    <h1>Career Agent 控制台</h1>
    <p>前端已迁移到 feature 结构，后续页面请放在对应 feature 内。</p>
    <nav class="entry-links">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/profile">学生画像</RouterLink>
      <RouterLink to="/matching">人岗匹配</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.dashboard-page {
  max-width: 860px;
  margin: 40px auto;
  padding: 24px;
  border: 1px solid #cbd5e1;
  border-radius: 16px;
  background: #ffffff;
}

h1 {
  margin: 0 0 12px;
  font-size: 30px;
  color: #0f172a;
}

p {
  margin: 0;
  color: #334155;
}

.entry-links {
  margin-top: 12px;
  display: flex;
  gap: 12px;
}
</style>
