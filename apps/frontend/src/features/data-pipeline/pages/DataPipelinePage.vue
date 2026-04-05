<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";

import type { JobPipelineTaskRecord } from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import { fetchJobPipelineTask, runJobPipeline } from "@/shared/api/job-pipeline";

const loading = reactive({
  run: false,
  refresh: false,
});

const form = reactive({
  mode: "cleanse_agent_portraits" as const,
  taskIdInput: "",
});

const uiState = reactive({
  error: "",
  success: "",
});

const currentTask = ref<JobPipelineTaskRecord | null>(null);
let timer: number | null = null;
let heartbeatTimer: number | null = null;
const heartbeatTick = ref(0);

type PipelineStage =
  | "queued"
  | "cleaning"
  | "generating"
  | "succeeded"
  | "failed"
  | "degraded"
  | "unknown";

/**
 * 作用：根据任务状态与后端 message 识别当前阶段。
 * 设计意图：后端任务是长链路异步过程，前端通过阶段语义避免用户误以为“点击后无响应”。
 */
function detectPipelineStage(task: JobPipelineTaskRecord | null): PipelineStage {
  if (!task) {
    return "unknown";
  }

  if (task.status === "queued") {
    return "queued";
  }
  if (task.status === "success") {
    return "succeeded";
  }
  if (task.status === "failed") {
    return "failed";
  }
  if (task.status === "degraded") {
    return "degraded";
  }

  const message = (task.message || "").toLowerCase();
  const isGeneratingByMessage =
    message.includes("agent") ||
    message.includes("画像") ||
    message.includes("portraits") ||
    message.includes("generate");

  if (isGeneratingByMessage) {
    return "generating";
  }

  if (task.total_jobs > 0 && task.processed_jobs >= task.total_jobs) {
    return "generating";
  }

  return "cleaning";
}

const isTaskRunning = computed(() => currentTask.value?.status === "running");

const pipelineStage = computed<PipelineStage>(() => detectPipelineStage(currentTask.value));

const pipelineStageLabel = computed(() => {
  switch (pipelineStage.value) {
    case "queued":
      return "排队中";
    case "cleaning":
      return "清洗数据中";
    case "generating":
      return "Agent 生成岗位画像中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "执行失败";
    case "degraded":
      return "降级完成";
    default:
      return "待开始";
  }
});

const pipelineProgressPercent = computed(() => {
  const task = currentTask.value;
  if (!task) {
    return 0;
  }
  if (task.status === "success" || task.status === "failed" || task.status === "degraded") {
    return 100;
  }
  if (task.status === "queued") {
    return 5;
  }

  if (pipelineStage.value === "generating") {
    return 90;
  }

  const total = Math.max(1, task.total_jobs);
  const cleanedRatio = Math.min(1, Math.max(0, task.processed_jobs / total));
  return Math.max(8, Math.round(cleanedRatio * 85));
});

const runButtonText = computed(() => {
  if (loading.run) {
    return "启动中...";
  }
  if (isTaskRunning.value) {
    return "任务执行中...";
  }
  return "开始生成画像";
});

const stageDots = computed(() => ".".repeat((heartbeatTick.value % 3) + 1));

const liveStageText = computed(() => {
  if (!isTaskRunning.value) {
    return pipelineStageLabel.value;
  }
  return `${pipelineStageLabel.value}${stageDots.value}`;
});

const stageIndex = computed(() => {
  switch (pipelineStage.value) {
    case "queued":
      return 0;
    case "cleaning":
      return 1;
    case "generating":
      return 2;
    case "succeeded":
      return 3;
    case "degraded":
      return 3;
    case "failed":
      return 3;
    default:
      return -1;
  }
});

const timelineSteps = computed(() => {
  const steps = ["任务排队", "清洗岗位数据", "Agent生成画像", "写入并完成"];
  return steps.map((label, index) => {
    const active = isTaskRunning.value && index === stageIndex.value;
    const completed = stageIndex.value > index || pipelineStage.value === "succeeded";
    const failed = pipelineStage.value === "failed" && index === 3;
    return {
      label,
      active,
      completed,
      failed,
    };
  });
});

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
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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
  if (heartbeatTimer === null) {
    heartbeatTimer = window.setInterval(() => {
      heartbeatTick.value += 1;
    }, 500);
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
      <h2>岗位画像生产中心</h2>
      <p>手动触发“清洗入库 + Agent 生成画像”流程，并实时查看动态进度。</p>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <h3>启动生产任务</h3>
      <div class="row">
        <label>
          执行方案
          <select v-model="form.mode" :disabled="loading.run || isTaskRunning">
            <option value="cleanse_agent_portraits">清洗数据入库 + Agent 生成 10 条岗位画像</option>
          </select>
        </label>
        <button
          class="primary-btn"
          :disabled="loading.run || isTaskRunning"
          @click="runPipelineNow"
        >
          {{ runButtonText }}
        </button>
      </div>
      <p v-if="isTaskRunning" class="stage-hint">
        <span class="pulse-dot" /> 当前阶段：{{ liveStageText }}（页面每 3 秒自动刷新）
      </p>
    </section>

    <section class="panel">
      <h3>任务追踪</h3>
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
        <p>
          <strong>任务 #{{ currentTask.id }}</strong>
          · 方案：清洗入库 + Agent 画像 · 状态码：{{ currentTask.status }}
        </p>
        <p class="stage-line">
          <span class="stage-chip">{{ liveStageText }}</span>
          <span v-if="currentTask.status === 'running'" class="refresh-tip">自动轮询中</span>
        </p>
        <div class="timeline" aria-label="流水线阶段时间线">
          <div
            v-for="step in timelineSteps"
            :key="step.label"
            class="timeline-step"
            :class="{
              'is-active': step.active,
              'is-completed': step.completed,
              'is-failed': step.failed,
            }"
          >
            <span class="timeline-dot" />
            <span class="timeline-label">{{ step.label }}</span>
          </div>
        </div>
        <div
          class="progress-wrap"
          role="progressbar"
          :aria-valuenow="pipelineProgressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-bar" :style="{ width: `${pipelineProgressPercent}%` }" />
        </div>
        <p class="progress-text">当前进度：{{ pipelineProgressPercent }}%</p>
        <p>清洗目标：{{ currentTask.total_jobs }}，已清洗：{{ currentTask.processed_jobs }}</p>
        <p>
          画像产出：{{ currentTask.success_profiles }}，失败任务：{{ currentTask.failed_profiles }}
        </p>
        <p>当前画像数量：{{ currentTask.family_count }}</p>
        <p v-if="currentTask.message">进度日志：{{ currentTask.message }}</p>
        <p v-if="currentTask.error_message" class="error-text">
          失败原因：{{ currentTask.error_message }}
        </p>
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

.stage-hint {
  margin: 10px 0 0;
  color: #0f766e;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #0f766e;
  animation: pulse 1.2s ease-in-out infinite;
}

.stage-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stage-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 2px 10px;
  font-size: 12px;
  color: #0f172a;
  background: #dbeafe;
}

.refresh-tip {
  font-size: 12px;
  color: #475569;
}

.progress-wrap {
  width: 100%;
  height: 8px;
  border-radius: 9999px;
  background: #e2e8f0;
  overflow: hidden;
  margin: 8px 0 4px;
}

.progress-bar {
  position: relative;
  height: 100%;
  background: linear-gradient(90deg, #0f766e 0%, #14b8a6 100%);
  transition: width 0.3s ease;
}

.progress-bar::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: linear-gradient(
    120deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.35) 30%,
    rgba(255, 255, 255, 0) 60%
  );
  animation: shimmer 1.6s linear infinite;
}

.timeline {
  margin: 10px 0 8px;
  display: grid;
  gap: 8px;
}

.timeline-step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 13px;
}

.timeline-dot {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  border: 2px solid #94a3b8;
  background: #ffffff;
}

.timeline-step.is-completed {
  color: #0f766e;
}

.timeline-step.is-completed .timeline-dot {
  border-color: #0f766e;
  background: #0f766e;
}

.timeline-step.is-active {
  color: #0f172a;
  font-weight: 600;
}

.timeline-step.is-active .timeline-dot {
  border-color: #14b8a6;
  background: #99f6e4;
  animation: pulse 1.2s ease-in-out infinite;
}

.timeline-step.is-failed {
  color: #b91c1c;
}

.timeline-step.is-failed .timeline-dot {
  border-color: #b91c1c;
  background: #fee2e2;
}

.progress-text {
  font-size: 12px;
  color: #334155;
}

.error-text {
  color: #b91c1c;
}

@keyframes pulse {
  0% {
    opacity: 0.45;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0.45;
    transform: scale(0.95);
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(110%);
  }
}

@media (max-width: 768px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
