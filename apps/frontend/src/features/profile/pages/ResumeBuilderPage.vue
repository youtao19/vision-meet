<script setup lang="ts">
/**
 * 文件作用：AI 简历生成页。
 * 职责说明：基础信息和教育经历用表单确定，经历信息由 AI 追问整理为确认稿，确认后再生成 HTML 简历。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import type {
  CreateResumeDraftRequest,
  CreateResumeHtmlRequest,
  ResumeDraftChatMessage,
  ResumeHtmlListItem,
  ResumeQualityWarning,
} from "@career/contracts/types";

import {
  createResumeDraft,
  createResumeHtml,
  getResumeHtmlRecord,
  listResumeHtmlRecords,
} from "@/shared/api/resume";
import { ApiRequestError } from "@/shared/api/http";

const resumeHistory = ref<ResumeHtmlListItem[]>([]);
const resumePreviewVisible = ref(false);
const resumePreviewHtml = ref("");
const resumeQualityWarnings = ref<ResumeQualityWarning[]>([]);
const chatMessages = ref<ResumeDraftChatMessage[]>([]);
const userMessage = ref("");
const draftText = ref("");
const draftConfirmed = ref(false);
const confirmedPayload = ref<CreateResumeHtmlRequest | null>(null);
const chatListRef = ref<HTMLElement | null>(null);

const RESUME_DRAFT_STORAGE_KEY = "career-agent.resume-builder.draft.v1";
const RESUME_DRAFT_HISTORY_STORAGE_KEY = "career-agent.resume-builder.draft-history.v1";

const loading = reactive({
  draft: false,
  resumeGenerate: false,
  resumeHistory: false,
  resumePreviewLoad: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

const resumeBuilder = reactive({
  basic: {
    name: "",
    phone: "",
    email: "",
    targetPosition: "",
    targetCity: "",
  },
  education: {
    school: "",
    major: "",
    degree: "",
    period: "",
    gpa: "",
    coreCourses: "",
    honors: "",
  },
});

type ResumeBuilderState = typeof resumeBuilder;

type PersistedResumeDraftState = {
  conversationId: string;
  resumeBuilder: ResumeBuilderState;
  chatMessages: ResumeDraftChatMessage[];
  userMessage: string;
  draftText: string;
  draftConfirmed: boolean;
  confirmedPayload: CreateResumeHtmlRequest | null;
  savedAt: string;
};

type PersistedResumeDraftConversation = PersistedResumeDraftState & {
  id: string;
  title: string;
  updatedAt: string;
};

const currentDraftConversationId = ref("");
const draftConversationHistory = ref<PersistedResumeDraftConversation[]>([]);

const canGenerateResume = computed(
  () => draftConfirmed.value && Boolean(confirmedPayload.value) && !loading.resumeGenerate,
);

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function resetMessage(): void {
  uiState.error = "";
  uiState.success = "";
}

function isResumeDraftChatMessage(value: unknown): value is ResumeDraftChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ResumeDraftChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") && typeof message.content === "string"
  );
}

function createDraftConversationId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDraftConversationId(): string {
  if (!currentDraftConversationId.value) {
    currentDraftConversationId.value = createDraftConversationId();
  }
  return currentDraftConversationId.value;
}

function cloneResumeBuilderState(): ResumeBuilderState {
  return JSON.parse(JSON.stringify(resumeBuilder)) as ResumeBuilderState;
}

function hasDraftConversationContent(state: PersistedResumeDraftState): boolean {
  const basic = state.resumeBuilder.basic;
  const education = state.resumeBuilder.education;
  return (
    [
      basic.name,
      basic.phone,
      basic.email,
      basic.targetPosition,
      basic.targetCity,
      education.school,
      education.major,
      education.degree,
      education.period,
      education.gpa,
      education.coreCourses,
      education.honors,
      state.userMessage,
      state.draftText,
    ].some((value) => value.trim()) || state.chatMessages.length > 0
  );
}

function buildDraftConversationTitle(state: PersistedResumeDraftState): string {
  const name = state.resumeBuilder.basic.name.trim();
  const target = state.resumeBuilder.basic.targetPosition.trim();
  if (name && target) return `${name} · ${target}`;
  if (target) return target;
  if (name) return `${name} 的简历追问`;
  const firstUserMessage = state.chatMessages
    .find((message) => message.role === "user")
    ?.content.trim();
  if (firstUserMessage) return firstUserMessage.slice(0, 24);
  return "未命名追问记录";
}

function normalizePersistedDraftState(
  value: Partial<PersistedResumeDraftState>,
): PersistedResumeDraftState | null {
  if (!value.resumeBuilder || !Array.isArray(value.chatMessages)) return null;
  if (!value.chatMessages.every(isResumeDraftChatMessage)) return null;
  return {
    conversationId:
      typeof value.conversationId === "string" && value.conversationId
        ? value.conversationId
        : createDraftConversationId(),
    resumeBuilder: value.resumeBuilder as ResumeBuilderState,
    chatMessages: value.chatMessages,
    userMessage: typeof value.userMessage === "string" ? value.userMessage : "",
    draftText: typeof value.draftText === "string" ? value.draftText : "",
    draftConfirmed: Boolean(value.draftConfirmed),
    confirmedPayload: value.confirmedPayload || null,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
  };
}

function readPersistedDraftState(): PersistedResumeDraftState | null {
  try {
    const raw = localStorage.getItem(RESUME_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return normalizePersistedDraftState(JSON.parse(raw) as Partial<PersistedResumeDraftState>);
  } catch {
    return null;
  }
}

function readDraftConversationHistory(): PersistedResumeDraftConversation[] {
  try {
    const raw = localStorage.getItem(RESUME_DRAFT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const state = normalizePersistedDraftState(item as Partial<PersistedResumeDraftState>);
        if (!state) return null;
        const id =
          typeof (item as { id?: unknown }).id === "string" && (item as { id: string }).id
            ? (item as { id: string }).id
            : state.conversationId;
        return {
          ...state,
          id,
          title:
            typeof (item as { title?: unknown }).title === "string"
              ? (item as { title: string }).title
              : buildDraftConversationTitle(state),
          updatedAt:
            typeof (item as { updatedAt?: unknown }).updatedAt === "string"
              ? (item as { updatedAt: string }).updatedAt
              : state.savedAt,
        };
      })
      .filter((item): item is PersistedResumeDraftConversation => Boolean(item))
      .sort((a, b) => Date.parse(b.updatedAt || b.savedAt) - Date.parse(a.updatedAt || a.savedAt))
      .slice(0, 30);
  } catch {
    return [];
  }
}

function loadDraftConversationHistory(): void {
  draftConversationHistory.value = readDraftConversationHistory();
}

function restorePersistedDraftState(): void {
  const persisted = readPersistedDraftState();
  if (!persisted) return;

  currentDraftConversationId.value = persisted.conversationId;
  Object.assign(resumeBuilder.basic, persisted.resumeBuilder.basic || {});
  Object.assign(resumeBuilder.education, persisted.resumeBuilder.education || {});
  chatMessages.value = persisted.chatMessages;
  userMessage.value = persisted.userMessage;
  draftText.value = persisted.draftText;
  draftConfirmed.value = persisted.draftConfirmed;
  confirmedPayload.value = persisted.confirmedPayload;
  if (chatMessages.value.length > 0 || draftText.value) {
    uiState.success = "已恢复上次未完成的简历追问记录。";
  }
}

function buildPersistedDraftState(): PersistedResumeDraftState {
  const savedAt = new Date().toISOString();
  return {
    conversationId: ensureDraftConversationId(),
    resumeBuilder: cloneResumeBuilderState(),
    chatMessages: chatMessages.value,
    userMessage: userMessage.value,
    draftText: draftText.value,
    draftConfirmed: draftConfirmed.value,
    confirmedPayload: confirmedPayload.value,
    savedAt,
  };
}

function persistDraftState(): void {
  const payload = buildPersistedDraftState();
  localStorage.setItem(RESUME_DRAFT_STORAGE_KEY, JSON.stringify(payload));

  if (!hasDraftConversationContent(payload)) return;

  const conversation: PersistedResumeDraftConversation = {
    ...payload,
    id: payload.conversationId,
    title: buildDraftConversationTitle(payload),
    updatedAt: payload.savedAt,
  };
  const nextHistory = [
    conversation,
    ...draftConversationHistory.value.filter((item) => item.id !== conversation.id),
  ].slice(0, 30);
  draftConversationHistory.value = nextHistory;
  localStorage.setItem(RESUME_DRAFT_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
}

function applyDraftConversationState(state: PersistedResumeDraftState): void {
  currentDraftConversationId.value = state.conversationId;
  Object.assign(resumeBuilder.basic, state.resumeBuilder.basic || {});
  Object.assign(resumeBuilder.education, state.resumeBuilder.education || {});
  chatMessages.value = state.chatMessages;
  userMessage.value = state.userMessage;
  draftText.value = state.draftText;
  draftConfirmed.value = state.draftConfirmed;
  confirmedPayload.value = state.confirmedPayload;
}

function restoreDraftConversation(conversation: PersistedResumeDraftConversation): void {
  resetMessage();
  applyDraftConversationState({
    conversationId: conversation.id,
    resumeBuilder: conversation.resumeBuilder,
    chatMessages: conversation.chatMessages,
    userMessage: conversation.userMessage,
    draftText: conversation.draftText,
    draftConfirmed: conversation.draftConfirmed,
    confirmedPayload: conversation.confirmedPayload,
    savedAt: conversation.savedAt,
  });
  persistDraftState();
  uiState.success = "已恢复追问记录，可以继续聊天。";
  void scrollChatToBottom();
}

function startNewDraftConversation(): void {
  resetMessage();
  if (hasDraftConversationContent(buildPersistedDraftState())) {
    persistDraftState();
  }
  currentDraftConversationId.value = createDraftConversationId();
  Object.assign(resumeBuilder.basic, {
    name: "",
    phone: "",
    email: "",
    targetPosition: "",
    targetCity: "",
  });
  Object.assign(resumeBuilder.education, {
    school: "",
    major: "",
    degree: "",
    period: "",
    gpa: "",
    coreCourses: "",
    honors: "",
  });
  chatMessages.value = [];
  userMessage.value = "";
  draftText.value = "";
  draftConfirmed.value = false;
  confirmedPayload.value = null;
  resumePreviewVisible.value = false;
  resumePreviewHtml.value = "";
  resumeQualityWarnings.value = [];
  persistDraftState();
  uiState.success = "已开始新的简历追问。";
}

function invalidateDraft(): void {
  draftConfirmed.value = false;
}

async function scrollChatToBottom(): Promise<void> {
  await nextTick();
  const chatList = chatListRef.value;
  if (chatList) {
    chatList.scrollTop = chatList.scrollHeight;
  }
}

function buildBasicPayload(): CreateResumeHtmlRequest["basic"] {
  return {
    name: resumeBuilder.basic.name.trim(),
    phone: resumeBuilder.basic.phone.trim(),
    email: resumeBuilder.basic.email.trim(),
    target_position: resumeBuilder.basic.targetPosition.trim(),
    target_city: resumeBuilder.basic.targetCity.trim() || undefined,
  };
}

function buildEducationPayload(): CreateResumeHtmlRequest["educations"] {
  return [
    {
      school: resumeBuilder.education.school.trim(),
      major: resumeBuilder.education.major.trim(),
      degree: resumeBuilder.education.degree.trim(),
      period: resumeBuilder.education.period.trim(),
      gpa: resumeBuilder.education.gpa.trim() || undefined,
      core_courses: resumeBuilder.education.coreCourses.trim() || undefined,
      honors: resumeBuilder.education.honors.trim() || undefined,
    },
  ];
}

function validateFixedFields(): string[] {
  const errors: string[] = [];
  if (!resumeBuilder.basic.name.trim()) errors.push("请填写姓名");
  if (!resumeBuilder.basic.phone.trim()) errors.push("请填写电话");
  if (!resumeBuilder.basic.email.trim()) errors.push("请填写邮箱");
  if (!resumeBuilder.basic.targetPosition.trim()) errors.push("请填写目标职位");
  if (
    !resumeBuilder.education.school.trim() ||
    !resumeBuilder.education.major.trim() ||
    !resumeBuilder.education.degree.trim() ||
    !resumeBuilder.education.period.trim()
  ) {
    errors.push("请完整填写教育背景");
  }
  return errors;
}

function buildDraftRequestPayload(messages: ResumeDraftChatMessage[]): CreateResumeDraftRequest {
  return {
    basic: buildBasicPayload(),
    educations: buildEducationPayload(),
    messages,
  };
}

function buildConfirmedResumePayload(): CreateResumeHtmlRequest | null {
  if (!confirmedPayload.value || !draftText.value.trim()) return null;
  return {
    ...confirmedPayload.value,
    basic: buildBasicPayload(),
    educations: buildEducationPayload(),
    confirmed_draft: draftText.value.trim(),
  };
}

async function loadResumeHistory(): Promise<void> {
  loading.resumeHistory = true;
  try {
    const response = await listResumeHtmlRecords(0, 20);
    resumeHistory.value = response.items;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeHistory = false;
  }
}

async function sendDraftMessage(preset?: string): Promise<void> {
  resetMessage();
  const errors = validateFixedFields();
  if (errors.length > 0) {
    uiState.error = errors.join("；");
    return;
  }

  const content = (preset ?? userMessage.value).trim();
  if (!content) {
    uiState.error = "请先输入要补充的经历信息";
    return;
  }

  const nextMessages: ResumeDraftChatMessage[] = [
    ...chatMessages.value,
    {
      role: "user",
      content,
    },
  ];
  chatMessages.value = nextMessages;
  userMessage.value = "";
  invalidateDraft();
  void scrollChatToBottom();

  loading.draft = true;
  try {
    const response = await createResumeDraft(buildDraftRequestPayload(nextMessages));
    chatMessages.value = [
      ...nextMessages,
      {
        role: "assistant",
        content: response.assistant_message,
      },
    ];
    void scrollChatToBottom();
    if (response.status === "draft_ready" && response.draft_text && response.resume_payload) {
      draftText.value = response.draft_text;
      confirmedPayload.value = response.resume_payload;
      uiState.success = "文字版确认稿已生成，请检查内容后再确认生成 HTML 简历。";
    } else {
      draftText.value = "";
      confirmedPayload.value = null;
    }
  } catch (error) {
    const message = formatApiError(error);
    uiState.error = message;
    chatMessages.value = [
      ...nextMessages,
      {
        role: "assistant",
        content: `这次整理失败：${message}\n\n你刚才输入的内容已保留，可以继续补充信息后再发送。`,
      },
    ];
    void scrollChatToBottom();
  } finally {
    loading.draft = false;
  }
}

function confirmDraft(): void {
  resetMessage();
  if (!draftText.value.trim() || !confirmedPayload.value) {
    uiState.error = "请先让 AI 生成文字版确认稿";
    return;
  }
  draftConfirmed.value = true;
  uiState.success = "确认稿已确认，可以生成 HTML 简历。";
}

async function generateResumeWithAgent(): Promise<void> {
  resetMessage();
  const errors = validateFixedFields();
  if (errors.length > 0) {
    uiState.error = errors.join("；");
    return;
  }
  if (!draftConfirmed.value) {
    uiState.error = "请先确认文字版简历信息";
    return;
  }

  const payload = buildConfirmedResumePayload();
  if (!payload) {
    uiState.error = "确认稿数据不完整，请重新生成确认稿";
    return;
  }

  loading.resumeGenerate = true;
  try {
    const response = await createResumeHtml(payload);
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = response.html;
    resumeQualityWarnings.value = response.quality_warnings || [];
    uiState.success = `简历已生成（ID: ${response.resume_id}），已在右侧预览。`;
    await loadResumeHistory();
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeGenerate = false;
  }
}

async function openResumeHistoryItem(resumeId: number): Promise<void> {
  resetMessage();
  loading.resumePreviewLoad = true;
  try {
    const record = await getResumeHtmlRecord(resumeId);
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = record.html;
    resumeQualityWarnings.value = [];
    uiState.success = `历史简历 #${record.id} 已载入预览。`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumePreviewLoad = false;
  }
}

function printResumePreview(): void {
  const frame = document.querySelector<HTMLIFrameElement>(".resume-preview-frame");
  frame?.contentWindow?.print();
}

watch(
  [resumeBuilder, chatMessages, userMessage, draftText, draftConfirmed, confirmedPayload],
  () => {
    persistDraftState();
  },
  { deep: true },
);

onMounted(() => {
  loadDraftConversationHistory();
  restorePersistedDraftState();
  void scrollChatToBottom();
  void loadResumeHistory();
});
</script>

<template>
  <section class="resume-builder-page">
    <header class="page-titlebar">
      <div>
        <p class="eyebrow">Resume Builder</p>
        <h2>简历生成</h2>
        <p>基础信息和教育经历用表单填写，经历由 AI 追问整理；确认文字版内容后再生成 HTML 简历。</p>
      </div>
      <div class="title-actions">
        <RouterLink class="ghost-btn" to="/profile">返回学生画像</RouterLink>
        <button
          class="ghost-btn"
          type="button"
          :disabled="loading.resumeHistory"
          @click="loadResumeHistory"
        >
          {{ loading.resumeHistory ? "刷新中..." : "刷新历史" }}
        </button>
        <button
          class="primary-btn"
          type="button"
          :disabled="!canGenerateResume"
          @click="generateResumeWithAgent"
        >
          {{ loading.resumeGenerate ? "生成中..." : "生成简历" }}
        </button>
      </div>
    </header>

    <p v-if="uiState.error" class="notice error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice success">{{ uiState.success }}</p>

    <section class="builder-grid">
      <main class="form-stack">
        <section class="panel">
          <header class="section-head">
            <h3>基础信息</h3>
            <span>用于简历页眉和求职目标</span>
          </header>
          <div class="field-grid four">
            <label>
              姓名
              <input
                v-model="resumeBuilder.basic.name"
                type="text"
                placeholder="例如：张三"
                @input="invalidateDraft"
              />
            </label>
            <label>
              目标职位
              <input
                v-model="resumeBuilder.basic.targetPosition"
                type="text"
                placeholder="Java 开发工程师"
                @input="invalidateDraft"
              />
            </label>
            <label>
              <span class="field-label">意向城市 <span class="optional-tag">选填</span></span>
              <input
                v-model="resumeBuilder.basic.targetCity"
                type="text"
                placeholder="杭州 / 上海 / 不限"
                @input="invalidateDraft"
              />
            </label>
            <label>
              电话
              <input
                v-model="resumeBuilder.basic.phone"
                type="text"
                placeholder="138xxxx1234"
                @input="invalidateDraft"
              />
            </label>
          </div>
          <label>
            邮箱
            <input
              v-model="resumeBuilder.basic.email"
              type="email"
              placeholder="name@email.com"
              @input="invalidateDraft"
            />
          </label>
        </section>

        <section class="panel">
          <header class="section-head">
            <h3>教育经历</h3>
            <span>学校、专业、课程和成绩</span>
          </header>
          <div class="field-grid four">
            <label>
              学校
              <input
                v-model="resumeBuilder.education.school"
                type="text"
                placeholder="XX 大学"
                @input="invalidateDraft"
              />
            </label>
            <label>
              专业
              <input
                v-model="resumeBuilder.education.major"
                type="text"
                placeholder="软件工程"
                @input="invalidateDraft"
              />
            </label>
            <label>
              学历
              <input
                v-model="resumeBuilder.education.degree"
                type="text"
                placeholder="本科"
                @input="invalidateDraft"
              />
            </label>
            <label>
              时间
              <input
                v-model="resumeBuilder.education.period"
                type="text"
                placeholder="2020.09 - 2024.06"
                @input="invalidateDraft"
              />
            </label>
          </div>
          <div class="field-grid two">
            <label>
              <span class="field-label">成绩/排名 <span class="optional-tag">选填</span></span>
              <input
                v-model="resumeBuilder.education.gpa"
                type="text"
                placeholder="GPA 3.6/4.0，专业前 20%"
                @input="invalidateDraft"
              />
            </label>
            <label>
              <span class="field-label">核心课程 <span class="optional-tag">选填</span></span>
              <input
                v-model="resumeBuilder.education.coreCourses"
                type="text"
                placeholder="数据结构、操作系统、数据库"
                @input="invalidateDraft"
              />
            </label>
          </div>
          <label>
            <span class="field-label">在校荣誉 <span class="optional-tag">选填</span></span>
            <textarea
              v-model="resumeBuilder.education.honors"
              rows="2"
              placeholder="奖学金、优秀学生干部、竞赛奖项"
              @input="invalidateDraft"
            />
          </label>
        </section>

        <section class="panel interview-panel">
          <div class="chat-shell">
            <header class="chat-header">
              <div class="chat-agent">
                <span class="chat-avatar material-symbols-outlined">auto_awesome</span>
                <div>
                  <h3>AI 追问经历</h3>
                  <span>{{
                    draftText ? "已整理确认稿" : loading.draft ? "正在分析回复" : "在线追问"
                  }}</span>
                </div>
              </div>
              <div class="chat-header-actions">
                <button
                  class="mini-btn"
                  type="button"
                  :disabled="loading.draft"
                  @click="startNewDraftConversation"
                >
                  新对话
                </button>
                <button
                  class="mini-btn"
                  type="button"
                  :disabled="loading.draft"
                  @click="sendDraftMessage('请开始追问我的经历，并告诉我应该先补充哪些信息。')"
                >
                  开始追问
                </button>
              </div>
            </header>

            <div ref="chatListRef" class="chat-list">
              <div v-if="chatMessages.length === 0" class="chat-empty">
                <span class="material-symbols-outlined">forum</span>
                <strong>还没有开始对话</strong>
                <p>
                  先填好上方表单，然后像聊天一样告诉 AI 你的经历。AI
                  会继续追问项目、实习、竞赛、校园经历和技能证明。
                </p>
              </div>
              <article
                v-for="(message, index) in chatMessages"
                :key="`${message.role}-${index}`"
                class="chat-row"
                :class="message.role"
              >
                <span class="message-avatar material-symbols-outlined">
                  {{ message.role === "user" ? "person" : "auto_awesome" }}
                </span>
                <div class="chat-message" :class="message.role">
                  <strong>{{ message.role === "user" ? "我" : "AI 简历助手" }}</strong>
                  <p>{{ message.content }}</p>
                </div>
              </article>
              <article v-if="loading.draft" class="chat-row assistant">
                <span class="message-avatar material-symbols-outlined">auto_awesome</span>
                <div class="chat-message assistant typing">
                  <strong>AI 简历助手</strong>
                  <p><span></span><span></span><span></span></p>
                </div>
              </article>
            </div>

            <div class="chat-composer">
              <textarea
                v-model="userMessage"
                rows="3"
                placeholder="像聊天一样输入：我做过一个校园招聘推荐系统，负责后端接口和数据库设计..."
                @keydown.meta.enter.prevent="sendDraftMessage()"
                @keydown.ctrl.enter.prevent="sendDraftMessage()"
              />
              <div class="composer-actions">
                <button
                  class="ghost-btn"
                  type="button"
                  :disabled="loading.draft"
                  @click="sendDraftMessage('请根据现有信息整理文字版简历确认稿。')"
                >
                  整理确认稿
                </button>
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="loading.draft"
                  @click="sendDraftMessage()"
                >
                  {{ loading.draft ? "发送中..." : "发送" }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel draft-panel">
          <header class="section-head">
            <div>
              <h3>文字版确认稿</h3>
              <span>{{ draftConfirmed ? "已确认" : draftText ? "待确认" : "等待 AI 整理" }}</span>
            </div>
            <button
              class="primary-btn"
              type="button"
              :disabled="!draftText || draftConfirmed"
              @click="confirmDraft"
            >
              {{ draftConfirmed ? "已确认" : "确认这份内容" }}
            </button>
          </header>
          <pre v-if="draftText" class="draft-text">{{ draftText }}</pre>
          <div v-else class="draft-empty">
            <span class="material-symbols-outlined">fact_check</span>
            <p>AI 整理完成后，会先在这里展示文字版简历信息。确认后才允许生成 HTML。</p>
          </div>
        </section>
      </main>

      <aside class="preview-stack">
        <section class="panel draft-history-panel">
          <header class="section-head">
            <div>
              <h3>追问记录</h3>
              <span>{{ draftConversationHistory.length }} 条</span>
            </div>
            <button class="mini-btn" type="button" @click="startNewDraftConversation">
              新对话
            </button>
          </header>
          <div class="draft-history-list">
            <button
              v-for="item in draftConversationHistory"
              :key="item.id"
              type="button"
              :class="{ active: item.id === currentDraftConversationId }"
              @click="restoreDraftConversation(item)"
            >
              <strong>{{ item.title }}</strong>
              <span>{{ formatDate(item.updatedAt || item.savedAt) }}</span>
              <small>
                {{ item.chatMessages.length }} 条对话
                <template v-if="item.draftConfirmed"> · 已确认</template>
                <template v-else-if="item.draftText"> · 待确认</template>
              </small>
            </button>
            <p v-if="draftConversationHistory.length === 0" class="empty-note">暂无追问记录。</p>
          </div>
        </section>

        <section class="panel preview-panel">
          <header class="section-head">
            <div>
              <h3>简历预览</h3>
              <span>{{ resumePreviewVisible ? "已生成" : "等待生成" }}</span>
            </div>
            <button
              v-if="resumePreviewVisible"
              class="mini-btn"
              type="button"
              @click="printResumePreview"
            >
              打印 / 导出 PDF
            </button>
          </header>
          <iframe
            v-if="resumePreviewVisible"
            class="resume-preview-frame"
            :srcdoc="resumePreviewHtml"
            title="简历预览"
          />
          <div v-else class="preview-empty">
            <span class="material-symbols-outlined">article</span>
            <p>确认文字版内容后点击“生成简历”，这里会展示 HTML 预览。</p>
          </div>
        </section>

        <section v-if="resumeQualityWarnings.length > 0" class="panel quality-panel">
          <header class="section-head">
            <h3>简历优化建议</h3>
            <span>{{ resumeQualityWarnings.length }} 条</span>
          </header>
          <ul class="quality-list">
            <li v-for="warning in resumeQualityWarnings" :key="warning.code">
              {{ warning.message }}
            </li>
          </ul>
        </section>

        <section class="panel history-panel">
          <header class="section-head">
            <h3>历史简历</h3>
            <span>{{ resumeHistory.length }} 条</span>
          </header>
          <div class="history-list">
            <button
              v-for="item in resumeHistory"
              :key="item.id"
              type="button"
              :disabled="loading.resumePreviewLoad"
              @click="openResumeHistoryItem(item.id)"
            >
              <strong>#{{ item.id }} {{ item.basic_name }}</strong>
              <span>{{ item.target_position }} · {{ formatDate(item.created_at) }}</span>
              <small>{{ item.model || "未知模型" }}</small>
            </button>
            <p v-if="resumeHistory.length === 0" class="empty-note">暂无历史简历记录。</p>
          </div>
        </section>
      </aside>
    </section>
  </section>
</template>

<style scoped>
.resume-builder-page {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 14px;
}

.page-titlebar,
.panel {
  border: 1px solid var(--glass-border);
  background: var(--glass-panel);
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  box-shadow:
    inset 0 1px 0 var(--glass-stroke),
    0 14px 30px rgba(49, 79, 136, 0.09);
}

.page-titlebar {
  min-height: 82px;
  padding: 16px 18px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  margin: 0;
  color: rgba(37, 55, 88, 0.62);
  font-size: 12px;
  font-weight: 800;
}

.page-titlebar h2 {
  margin: 4px 0;
  color: var(--glass-title);
  font-size: 26px;
}

.page-titlebar p {
  margin: 0;
  color: var(--glass-muted);
}

.title-actions,
.composer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.builder-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  gap: 14px;
  align-items: start;
}

.form-stack,
.preview-stack {
  display: grid;
  gap: 14px;
}

.panel {
  border-radius: 16px;
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h3 {
  margin: 0;
  color: var(--glass-title);
  font-size: 17px;
}

.section-head span {
  display: block;
  margin-top: 3px;
  color: var(--glass-muted);
  font-size: 12px;
}

.field-grid {
  display: grid;
  gap: 12px;
}

.field-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-grid.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
  color: var(--glass-title);
  font-size: 13px;
  font-weight: 800;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.optional-tag {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 2px 6px;
  color: rgba(37, 55, 88, 0.68);
  background: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 700;
}

input,
textarea {
  width: 100%;
  border: 1px solid rgba(31, 58, 97, 0.12);
  border-radius: 10px;
  padding: 10px 11px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.48);
  font-family: inherit;
}

textarea {
  resize: vertical;
}

.primary-btn,
.ghost-btn,
.mini-btn {
  border: 1px solid rgba(255, 255, 255, 0.62);
  cursor: pointer;
  font-weight: 800;
  font-family: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.primary-btn,
.ghost-btn {
  min-height: 38px;
  border-radius: 10px;
  padding: 0 14px;
}

.mini-btn {
  min-height: 32px;
  border-radius: 9px;
  padding: 0 10px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.46);
  font-size: 12px;
}

.primary-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  box-shadow: 0 12px 24px rgba(40, 97, 200, 0.16);
}

.ghost-btn {
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.42);
}

.primary-btn:disabled,
.ghost-btn:disabled,
.mini-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.notice {
  margin: 0;
  padding: 11px 14px;
  border-radius: 12px;
  font-weight: 700;
}

.notice.error {
  color: #9f1239;
  background: rgba(255, 228, 230, 0.58);
}

.notice.success {
  color: #047857;
  background: rgba(220, 252, 231, 0.58);
}

.interview-panel {
  padding: 0;
  overflow: hidden;
}

.chat-shell {
  min-height: 560px;
  display: grid;
  grid-template-rows: auto minmax(280px, 1fr) auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.54), rgba(239, 247, 255, 0.22)),
    radial-gradient(circle at 20% 0%, rgba(75, 134, 255, 0.12), transparent 34%);
}

.chat-header {
  min-height: 70px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(31, 58, 97, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-agent {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-avatar,
.message-avatar {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #0891b2);
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.2);
}

.chat-avatar {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  font-size: 23px;
}

.chat-agent h3 {
  margin: 0;
  color: var(--glass-title);
  font-size: 17px;
}

.chat-agent span:not(.chat-avatar) {
  display: block;
  margin-top: 3px;
  color: var(--glass-muted);
  font-size: 12px;
  font-weight: 700;
}

.chat-list {
  min-height: 330px;
  max-height: 560px;
  overflow: auto;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chat-empty,
.draft-empty,
.preview-empty {
  border: 1px dashed rgba(23, 135, 199, 0.36);
  border-radius: 12px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--glass-muted);
  text-align: center;
}

.chat-empty {
  min-height: 260px;
  margin: auto 0;
  background: rgba(255, 255, 255, 0.28);
}

.chat-empty .material-symbols-outlined,
.draft-empty .material-symbols-outlined,
.preview-empty .material-symbols-outlined {
  font-size: 42px;
  color: var(--glass-primary-strong);
}

.chat-empty strong {
  color: var(--glass-title);
}

.chat-empty p,
.draft-empty p,
.preview-empty p {
  max-width: 420px;
  margin: 0;
}

.chat-row {
  display: flex;
  align-items: flex-end;
  gap: 9px;
}

.chat-row.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  font-size: 18px;
}

.chat-row.user .message-avatar {
  background: linear-gradient(135deg, #334155, #64748b);
  box-shadow: 0 10px 18px rgba(51, 65, 85, 0.14);
}

.chat-message {
  max-width: min(620px, 78%);
  border: 1px solid rgba(31, 58, 97, 0.08);
  padding: 11px 13px;
  display: grid;
  gap: 6px;
  box-shadow: 0 10px 22px rgba(31, 58, 97, 0.08);
}

.chat-message.assistant {
  border-radius: 16px 16px 16px 6px;
  background: rgba(255, 255, 255, 0.72);
}

.chat-message.user {
  border-radius: 16px 16px 6px 16px;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #0f766e);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.18);
}

.chat-message strong {
  color: var(--glass-title);
  font-size: 12px;
}

.chat-message.user strong,
.chat-message.user p {
  color: #fff;
}

.chat-message p {
  margin: 0;
  color: var(--glass-title);
  white-space: pre-wrap;
  line-height: 1.65;
}

.chat-message.typing p {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 20px;
}

.chat-message.typing span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.5);
  animation: typing-dot 1.05s infinite ease-in-out;
}

.chat-message.typing span:nth-child(2) {
  animation-delay: 0.14s;
}

.chat-message.typing span:nth-child(3) {
  animation-delay: 0.28s;
}

.chat-composer {
  border-top: 1px solid rgba(31, 58, 97, 0.1);
  padding: 12px;
  background: rgba(255, 255, 255, 0.52);
  display: grid;
  gap: 10px;
}

.chat-composer textarea {
  min-height: 82px;
  margin: 0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
}

.chat-composer .composer-actions {
  justify-content: flex-end;
}

@keyframes typing-dot {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.draft-text {
  min-height: 220px;
  max-height: 520px;
  overflow: auto;
  margin: 0;
  border: 1px solid rgba(31, 58, 97, 0.1);
  border-radius: 14px;
  padding: 14px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.38);
  font-family: inherit;
  white-space: pre-wrap;
  line-height: 1.7;
}

.draft-empty {
  min-height: 220px;
}

.preview-panel {
  min-height: 720px;
}

.resume-preview-frame {
  width: 100%;
  min-height: 640px;
  border: 1px solid rgba(31, 58, 97, 0.12);
  border-radius: 12px;
  background: #fff;
}

.preview-empty {
  min-height: 640px;
}

.quality-list {
  margin: 0;
  padding-left: 18px;
  color: var(--glass-title);
  display: grid;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.draft-history-list,
.history-list {
  display: grid;
  gap: 9px;
}

.draft-history-list button,
.history-list button {
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 10px;
  padding: 10px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.34);
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 4px;
}

.draft-history-list button.active {
  border-color: rgba(37, 99, 235, 0.36);
  background: rgba(219, 234, 254, 0.52);
  box-shadow: inset 3px 0 0 #2563eb;
}

.draft-history-list span,
.draft-history-list small,
.history-list span,
.history-list small,
.empty-note {
  color: var(--glass-muted);
}

@media (max-width: 1080px) {
  .page-titlebar,
  .section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .title-actions,
  .composer-actions {
    flex-wrap: wrap;
  }

  .builder-grid,
  .field-grid.two,
  .field-grid.four {
    grid-template-columns: 1fr;
  }

  .preview-panel,
  .resume-preview-frame,
  .preview-empty {
    min-height: 520px;
  }
}
</style>
