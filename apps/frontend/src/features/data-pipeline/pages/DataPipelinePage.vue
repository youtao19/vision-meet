<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";

const loading = reactive({
  run: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

type MockStage = "queued" | "cleaning" | "generating" | "packaging" | "done";

const mockTaskId = ref<number | null>(null);
const currentStage = ref<MockStage>("queued");
const progress = ref(0);
const isRunning = ref(false);
const stageMessage = ref("待开始");
const generatedPreviewCount = ref(0);
const currentRoleHint = ref("");

let simulationTimer: number | null = null;
let heartbeatTimer: number | null = null;
const heartbeatTick = ref(0);

const previewRoles = [
  "前端开发工程师",
  "Java开发工程师",
  "测试工程师",
  "技术支持工程师",
  "实施工程师",
  "C/C++开发工程师",
  "软件测试工程师",
  "硬件测试工程师",
  "网络工程师",
  "产品专员/助理",
];

const timelineSteps = computed(() => {
  const stageOrder: MockStage[] = ["queued", "cleaning", "generating", "packaging", "done"];
  const labels: Record<MockStage, string> = {
    queued: "任务排队",
    cleaning: "清洗岗位数据",
    generating: "模拟 Agent 生成画像",
    packaging: "汇总与结果整理",
    done: "演示完成",
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
    return "模拟生成中...";
  }
  return "开始生成画像";
});

/**
 * 作用：结束演示定时器，避免组件销毁后仍有异步任务更新状态。
 */
function stopSimulation(): void {
  if (simulationTimer !== null) {
    window.clearInterval(simulationTimer);
    simulationTimer = null;
  }
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * 作用：启动纯前端模拟流程，不发起后端请求、不写入数据库。
 * 注意：该流程仅用于比赛演示“调用 Agent 生成画像”的动态效果。
 */
function startMockPipeline(): void {
  if (isRunning.value) {
    return;
  }

  loading.run = true;
  uiState.error = "";
  uiState.success = "";

  mockTaskId.value = Math.floor(Date.now() / 1000);
  currentStage.value = "queued";
  progress.value = 3;
  generatedPreviewCount.value = 0;
  currentRoleHint.value = "";
  stageMessage.value = "任务排队中";
  isRunning.value = true;
  loading.run = false;

  heartbeatTick.value = 0;
  if (heartbeatTimer === null) {
    heartbeatTimer = window.setInterval(() => {
      heartbeatTick.value += 1;
    }, 500);
  }

  let stepTick = 0;
  simulationTimer = window.setInterval(() => {
    stepTick += 1;

    if (stepTick <= 2) {
      currentStage.value = "queued";
      stageMessage.value = "任务排队中";
      progress.value = Math.min(8, progress.value + 2);
      return;
    }

    if (stepTick <= 8) {
      currentStage.value = "cleaning";
      stageMessage.value = "正在清洗岗位数据";
      progress.value = Math.min(42, progress.value + 6);
      return;
    }

    if (stepTick <= 20) {
      currentStage.value = "generating";
      stageMessage.value = "模拟 Agent 生成岗位画像";
      progress.value = Math.min(88, progress.value + 4);

      const nextCount = Math.min(previewRoles.length, generatedPreviewCount.value + 1);
      generatedPreviewCount.value = nextCount;
      currentRoleHint.value = previewRoles[nextCount - 1] || "";
      return;
    }

    if (stepTick <= 24) {
      currentStage.value = "packaging";
      stageMessage.value = "正在汇总画像结果";
      progress.value = Math.min(98, progress.value + 2);
      return;
    }

    currentStage.value = "done";
    progress.value = 100;
    isRunning.value = false;
    stopSimulation();
  }, 700);
}

onBeforeUnmount(() => {
  stopSimulation();
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
        <button class="primary-btn" :disabled="isRunning || loading.run" @click="startMockPipeline">
          {{ runButtonText }}
        </button>
      </div>
      <p v-if="isRunning" class="stage-hint">
        <span class="pulse-dot" /> 当前阶段：{{ liveStageText }}
      </p>
    </section>

    <section class="panel">
      <h3>任务追踪</h3>

      <article v-if="mockTaskId" class="task-card">
        <p>
          <strong>任务 #{{ mockTaskId }}</strong>
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

        <p>模拟生成数量：{{ generatedPreviewCount }} / 10</p>
        <p v-if="currentRoleHint">当前生成岗位：{{ currentRoleHint }}</p>
        <p class="db-safe-tip">数据库状态：本次演示不会写入任何数据。</p>
      </article>

      <p v-else class="empty-text">请点击“开始生成画像”启动演示任务。</p>
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

select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
}

.primary-btn {
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.empty-text {
  margin: 10px 0 0;
  color: #64748b;
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

.progress-text {
  font-size: 12px;
  color: #334155;
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
