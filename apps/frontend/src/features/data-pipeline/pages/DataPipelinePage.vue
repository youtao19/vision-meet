<script setup lang="ts">
import type { JobPipelineTaskRecord, JobPipelineTaskStatus } from "@career/contracts/types";

import { computed, onBeforeUnmount, reactive, ref } from "vue";

import { fetchJobPipelineTask, runJobPipeline } from "@/shared/api/job-pipeline";

const loading = reactive({
  run: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

type PipelineStage = "queued" | "cleaning" | "generating" | "packaging" | "done" | "failed";

const currentTask = ref<JobPipelineTaskRecord | null>(null);
const currentStage = ref<PipelineStage>("queued");
const progress = ref(0);
const isRunning = ref(false);
const stageMessage = ref("待开始");

let pollingTimer: number | null = null;
let heartbeatTimer: number | null = null;
const heartbeatTick = ref(0);

const timelineSteps = computed(() => {
  const stageOrder: PipelineStage[] = ["queued", "cleaning", "generating", "packaging", "done"];
  const labels: Record<PipelineStage, string> = {
    queued: "任务排队",
    cleaning: "清洗岗位数据",
    generating: "生成岗位画像",
    packaging: "汇总与结果整理",
    done: "完成",
    failed: "失败",
  };
  const currentIndex = stageOrder.indexOf(currentStage.value);

  return stageOrder.map((stage, index) => ({
    label: labels[stage],
    active: isRunning.value && index === currentIndex,
    completed: index < currentIndex || (!isRunning.value && currentStage.value === "done"),
  }));
});

const stageDots = computed(() => ".".repeat((heartbeatTick.value % 3) + 1));

const liveStageText = computed(() => {
  if (!isRunning.value) {
    return stageMessage.value;
  }
  return `${stageMessage.value}${stageDots.value}`;
});

const runButtonText = computed(() => {
  if (loading.run) {
    return "启动中...";
  }
  if (isRunning.value) {
    return "生成中...";
  }
  return "开始生成画像";
});

const generatedPreviewCount = computed(() => currentTask.value?.success_profiles ?? 0);

const totalJobsText = computed(() => {
  const total = currentTask.value?.total_jobs ?? 0;
  return total > 0 ? String(total) : "待统计";
});

const processedJobsText = computed(() => {
  const task = currentTask.value;
  if (!task) {
    return "0";
  }
  return `${task.processed_jobs} / ${task.total_jobs || "待统计"}`;
});

function stopPolling(): void {
  if (pollingTimer !== null) {
    window.clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function stopRuntimeTimers(): void {
  stopPolling();
  stopHeartbeat();
}

function isTerminalStatus(status: JobPipelineTaskStatus): boolean {
  return status === "success" || status === "degraded" || status === "failed";
}

function resolveStage(task: JobPipelineTaskRecord): PipelineStage {
  if (task.status === "failed") {
    return "failed";
  }
  if (task.status === "success" || task.status === "degraded") {
    return "done";
  }
  if (task.status === "queued") {
    return "queued";
  }
  if (task.total_jobs > 0 && task.processed_jobs >= task.total_jobs) {
    return "generating";
  }
  return "cleaning";
}

function resolveProgress(task: JobPipelineTaskRecord): number {
  if (task.status === "success" || task.status === "degraded") {
    return 100;
  }
  if (task.status === "failed") {
    return Math.max(progress.value, 10);
  }
  if (task.status === "queued") {
    return 5;
  }

  const totalJobs = Math.max(task.total_jobs, 1);
  const cleanedRatio = Math.min(1, task.processed_jobs / totalJobs);
  const cleanProgress = Math.round(8 + cleanedRatio * 62);
  if (task.processed_jobs < task.total_jobs || task.total_jobs === 0) {
    return Math.max(progress.value, cleanProgress);
  }

  // 后端清洗完成后会同步调用 Agent，期间任务仍是 running；这里给出真实状态下的等待进度。
  return Math.max(progress.value, 88);
}

function resolveStageMessage(task: JobPipelineTaskRecord): string {
  if (task.error_message) {
    return task.error_message;
  }
  if (task.message) {
    return task.message;
  }
  if (task.status === "queued") {
    return "任务排队中";
  }
  if (task.status === "running") {
    return "流水线执行中";
  }
  return "待开始";
}

function applyTaskState(task: JobPipelineTaskRecord): void {
  currentTask.value = task;
  currentStage.value = resolveStage(task);
  progress.value = resolveProgress(task);
  stageMessage.value = resolveStageMessage(task);
  isRunning.value = !isTerminalStatus(task.status);

  if (task.status === "success" || task.status === "degraded") {
    uiState.success = task.message || "岗位画像流水线执行完成。";
    stopRuntimeTimers();
  }

  if (task.status === "failed") {
    uiState.error = task.error_message || task.message || "岗位画像流水线执行失败。";
    stopRuntimeTimers();
  }
}

async function refreshCurrentTask(): Promise<void> {
  if (!currentTask.value) {
    return;
  }

  try {
    const latestTask = await fetchJobPipelineTask(currentTask.value.id);
    applyTaskState(latestTask);
  } catch (error) {
    uiState.error = error instanceof Error ? error.message : "任务状态查询失败。";
    isRunning.value = false;
    stopRuntimeTimers();
  }
}

function startPolling(): void {
  stopPolling();
  pollingTimer = window.setInterval(() => {
    void refreshCurrentTask();
  }, 1500);
}

function startHeartbeat(): void {
  heartbeatTick.value = 0;
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    heartbeatTick.value += 1;
  }, 500);
}

async function startPipeline(): Promise<void> {
  if (isRunning.value) {
    return;
  }

  loading.run = true;
  uiState.error = "";
  uiState.success = "";
  stopRuntimeTimers();
  currentTask.value = null;
  currentStage.value = "queued";
  progress.value = 0;
  stageMessage.value = "任务排队中";

  try {
    const task = await runJobPipeline({ mode: "cleanse_agent_portraits" });
    applyTaskState(task);
    if (!isTerminalStatus(task.status)) {
      isRunning.value = true;
      startHeartbeat();
      startPolling();
      void refreshCurrentTask();
    }
  } catch (error) {
    uiState.error = error instanceof Error ? error.message : "岗位画像流水线启动失败。";
    isRunning.value = false;
  } finally {
    loading.run = false;
  }
}

onBeforeUnmount(() => {
  stopRuntimeTimers();
});
</script>

<template>
  <section class="pipeline-page">
    <header class="page-header">
      <h2>岗位画像生产中心</h2>
    </header>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="panel">
      <div class="row">
        <label>
          执行方案
          <select disabled>
            <option>Agent 生成 10 条岗位画像</option>
          </select>
        </label>
        <button class="primary-btn" :disabled="isRunning || loading.run" @click="startPipeline">
          {{ runButtonText }}
        </button>
      </div>
      <p v-if="isRunning" class="stage-hint">
        <span class="pulse-dot" /> 当前阶段：{{ liveStageText }}
      </p>
    </section>

    <section class="panel">
      <h3>任务追踪</h3>

      <article v-if="currentTask" class="task-card">
        <p>
          <strong>任务 #{{ currentTask.id }}</strong>
        </p>
        <p class="stage-line">
          <span class="stage-chip">{{ liveStageText }}</span>
        </p>

        <div class="timeline" aria-label="演示阶段时间线">
          <div
            v-for="step in timelineSteps"
            :key="step.label"
            class="timeline-step"
            :class="{ 'is-active': step.active, 'is-completed': step.completed }"
          >
            <span class="timeline-dot" />
            <span class="timeline-label">{{ step.label }}</span>
          </div>
        </div>

        <div
          class="progress-wrap"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-bar" :style="{ width: `${progress}%` }" />
        </div>
        <p class="progress-text">当前进度：{{ progress }}%</p>

        <p>清洗岗位：{{ processedJobsText }}</p>
        <p>岗位总数：{{ totalJobsText }}</p>
        <p>生成数量：{{ generatedPreviewCount }} / 10</p>
        <p v-if="currentTask.error_message" class="error-detail">
          失败原因：{{ currentTask.error_message }}
        </p>
      </article>

      <p v-else class="empty-text">请点击“开始生成画像”启动任务。</p>
    </section>
  </section>
</template>

<style scoped>
.pipeline-page {
  max-width: 1040px;
  margin: 24px auto;
  display: grid;
  gap: 18px;
}

.page-header h2 {
  margin: 0;
  color: var(--glass-title);
  font-size: 32px;
  letter-spacing: -0.03em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.page-header p {
  margin: 8px 0 0;
  color: var(--glass-muted);
}

.notice {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  backdrop-filter: blur(18px);
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.26));
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  padding: 20px;
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 18px 36px rgba(44, 73, 127, 0.1);
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
}

label {
  display: grid;
  gap: 8px;
  color: rgba(28, 48, 82, 0.84);
  font-weight: 600;
}

select {
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 16px;
  padding: 10px 12px;
  color: #16304e;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 10px 22px rgba(61, 90, 152, 0.06);
}

.primary-btn {
  border-radius: 16px;
  padding: 10px 14px;
  cursor: pointer;
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgba(73, 182, 223, 0.92), rgba(64, 105, 236, 0.92));
  color: #ffffff;
  font-weight: 700;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 16px 28px rgba(45, 99, 203, 0.22);
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.task-card {
  margin-top: 12px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(225, 244, 255, 0.34));
  border: 1px solid rgba(255, 255, 255, 0.62);
  padding: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.task-card p {
  margin: 4px 0;
}

.empty-text {
  margin: 10px 0 0;
  color: rgba(56, 80, 116, 0.74);
}

.stage-hint {
  margin: 10px 0 0;
  color: var(--glass-primary);
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
  padding: 4px 12px;
  font-size: 12px;
  color: #153556;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(214, 239, 255, 0.46));
  border: 1px solid rgba(152, 217, 255, 0.72);
}

.refresh-tip {
  font-size: 12px;
  color: #475569;
}

.progress-wrap {
  width: 100%;
  height: 8px;
  border-radius: 9999px;
  background: rgba(160, 181, 214, 0.24);
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
  color: rgba(56, 80, 116, 0.74);
  font-size: 13px;
}

.timeline-dot {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  border: 2px solid rgba(122, 147, 185, 0.62);
  background: rgba(255, 255, 255, 0.9);
}

.timeline-step.is-completed {
  color: #0f766e;
}

.timeline-step.is-completed .timeline-dot {
  border-color: #0f766e;
  background: #0f766e;
}

.timeline-step.is-active {
  color: var(--glass-title);
  font-weight: 600;
}

.timeline-step.is-active .timeline-dot {
  border-color: #14b8a6;
  background: #99f6e4;
  animation: pulse 1.2s ease-in-out infinite;
}

.progress-text {
  font-size: 12px;
  color: rgba(42, 63, 96, 0.82);
}

.error-detail {
  color: #991b1b;
  font-weight: 600;
}

.db-safe-tip {
  color: #0f766e;
  font-weight: 600;
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
