<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue";

import type { JobPipelineTaskRecord } from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import { fetchJobPipelineTask, runJobPipeline } from "@/shared/api/job-pipeline";

const loading = reactive({
  run: false,
  refresh: false,
});

const form = reactive({
  mode: "facts_canonical_full" as const,
  taskIdInput: "",
});

const uiState = reactive({
  error: "",
  success: "",
});

const currentTask = ref<JobPipelineTaskRecord | null>(null);
let timer: number | null = null;

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试";
}

function toPositiveInt(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stopAutoRefresh(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function tryStartAutoRefresh(): void {
  if (!currentTask.value || currentTask.value.status !== "running") {
    stopAutoRefresh();
    return;
  }
  if (timer !== null) {
    return;
  }
  timer = window.setInterval(() => {
    if (!currentTask.value) {
      stopAutoRefresh();
      return;
    }
    void refreshTask(currentTask.value.id);
  }, 3000);
}

async function refreshTask(taskId?: number): Promise<void> {
  const resolvedTaskId = taskId ?? toPositiveInt(form.taskIdInput);
  if (!resolvedTaskId) {
    uiState.error = "请输入合法的任务 ID";
    return;
  }

  loading.refresh = true;
  uiState.error = "";
  uiState.success = "";
  try {
    currentTask.value = await fetchJobPipelineTask(resolvedTaskId);
    form.taskIdInput = String(resolvedTaskId);
    tryStartAutoRefresh();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.refresh = false;
  }
}

async function runPipelineNow(): Promise<void> {
  loading.run = true;
  uiState.error = "";
  uiState.success = "";

  try {
    const task = await runJobPipeline({ mode: form.mode });
    currentTask.value = task;
    form.taskIdInput = String(task.id);
    uiState.success = `流水线任务 #${task.id} 已启动`;
    await refreshTask(task.id);
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.run = false;
  }
}

onBeforeUnmount(() => {
  stopAutoRefresh();
});
</script>

<template>
  <section class="pipeline-page">
    <header class="page-header">
      <h2>数据处理中心</h2>
      <p>手动触发岗位智能流水线，跟踪事实抽取与标准岗位聚合进度。</p>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>启动任务</h3>
      <div class="row">
        <label>
          运行模式
          <select v-model="form.mode" :disabled="loading.run">
            <option value="facts_canonical_full">facts_canonical_full（仅事实+标准岗位）</option>
          </select>
        </label>
        <button class="primary-btn" :disabled="loading.run" @click="runPipelineNow">
          {{ loading.run ? "启动中..." : "启动流水线" }}
        </button>
      </div>
    </section>

    <section class="panel">
      <h3>任务查询</h3>
      <div class="row">
        <label>
          任务 ID
          <input v-model="form.taskIdInput" type="text" placeholder="例如 12" />
        </label>
        <button class="ghost-btn" :disabled="loading.refresh" @click="refreshTask()">
          {{ loading.refresh ? "刷新中..." : "查询任务" }}
        </button>
      </div>

      <article v-if="currentTask" class="task-card">
        <p><strong>任务 #{{ currentTask.id }}</strong> · {{ currentTask.mode }} · {{ currentTask.status }}</p>
        <p>岗位总数：{{ currentTask.total_jobs }}，已处理：{{ currentTask.processed_jobs }}</p>
        <p>成功画像：{{ currentTask.success_profiles }}，失败：{{ currentTask.failed_profiles }}</p>
        <p>图谱节点：{{ currentTask.graph_nodes }}，图谱边：{{ currentTask.graph_edges }}</p>
        <p>岗位族覆盖：{{ currentTask.family_count }}</p>
        <p v-if="currentTask.message">消息：{{ currentTask.message }}</p>
        <p v-if="currentTask.error_message" class="error-text">错误：{{ currentTask.error_message }}</p>
      </article>
    </section>
  </section>
</template>

<style scoped>
.pipeline-page {
  max-width: 980px;
  margin: 24px auto;
  display: grid;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  color: #111827;
}

.page-header p {
  margin: 8px 0 0;
  color: #475569;
}

.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
}

.notice-error {
  background: #fee2e2;
  color: #991b1b;
}

.notice-success {
  background: #dcfce7;
  color: #166534;
}

.panel {
  background: #ffffff;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  padding: 16px;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
}

label {
  display: grid;
  gap: 6px;
  color: #334155;
}

input,
select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
}

.primary-btn,
.ghost-btn {
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.ghost-btn {
  border: 1px solid #94a3b8;
  background: #f8fafc;
  color: #111827;
}

.task-card {
  margin-top: 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 12px;
}

.task-card p {
  margin: 4px 0;
}

.error-text {
  color: #b91c1c;
}

@media (max-width: 768px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
