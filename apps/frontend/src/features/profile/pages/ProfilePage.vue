<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListItem,
  StudentProfileRecord,
} from "@career/contracts/types";

import { createResumeHtml, getResumeHtmlRecord, listResumeHtmlRecords } from "@/shared/api/agent";
import { ApiRequestError } from "@/shared/api/http";
import { fetchJobs } from "@/shared/api/jobs";
import {
  createStudentProfile,
  createStudentProfileFromResume,
  fetchStudentProfiles,
} from "@/shared/api/profile";

/**
 * 文件作用：学生画像中心。
 * 职责说明：统一承载“简历生成（用于画像构建）”“学生画像生成”“画像历史回看”三个流程。
 * 依赖边界：画像数据与历史来自 profile API，简历生成与历史来自 ai resume API。
 */

type InputMode = "manual" | "resume";

interface CapabilityFormState {
  certificates: string;
  innovationAbility: number | "";
  learningAbility: number | "";
  pressureResistance: number | "";
  communicationAbility: number | "";
  internshipAbility: number | "";
}

interface CapabilityEntry {
  label: string;
  value: string;
}

const mode = ref<InputMode>("manual");
const profileRecords = ref<StudentProfileRecord[]>([]);
const resumeHistory = ref<ResumeHtmlListItem[]>([]);
const selectedProfileId = ref<number | null>(null);

const loading = reactive({
  profileBootstrap: false,
  manualSubmit: false,
  resumeSubmit: false,
  resumeGenerate: false,
  resumeHistory: false,
  resumePreviewLoad: false,
  resumeTargetRoleSearch: false,
});

const manualForm = reactive({
  name: "",
  targetRole: "",
  education: "",
  skills: "",
  projects: "",
  summary: "",
});

const resumeBuilder = reactive({
  basic: {
    name: "",
    phone: "",
    email: "",
    targetPosition: "",
  },
  summary: "",
  education: {
    school: "",
    major: "",
    degree: "",
    period: "",
  },
  experience: {
    organization: "",
    role: "",
    period: "",
    responsibilities: "",
    achievements: "",
  },
  skills: "",
});

const resumeUpload = reactive({
  targetRole: "",
  targetRoleOptions: [] as string[],
});

const manualCapability = reactive<CapabilityFormState>({
  certificates: "",
  innovationAbility: "",
  learningAbility: "",
  pressureResistance: "",
  communicationAbility: "",
  internshipAbility: "",
});

const resumeFile = ref<File | null>(null);
const resumePreviewVisible = ref(false);
const resumePreviewHtml = ref("");
const resumeBuilderExpanded = ref(false); // 简历生成器是否展开

const uiState = reactive({
  error: "",
  success: "",
  resumeError: "",
  resumeSuccess: "",
});

const latestProfile = computed(() => {
  if (selectedProfileId.value !== null) {
    return profileRecords.value.find((item) => item.id === selectedProfileId.value) ?? null;
  }
  return profileRecords.value[0] ?? null;
});
const capabilityLevelOptions = [
  { value: 1, label: "1 - 待提升" },
  { value: 2, label: "2 - 一般" },
  { value: 3, label: "3 - 良好" },
  { value: 4, label: "4 - 较强" },
  { value: 5, label: "5 - 优秀" },
];

function parseTagText(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[，,\n\s/|]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试";
}

function resetProfileMessage(): void {
  uiState.error = "";
  uiState.success = "";
}

function resetResumeMessage(): void {
  uiState.resumeError = "";
  uiState.resumeSuccess = "";
}

function hasEmptyCapability(input: CapabilityFormState): boolean {
  return (
    [input.certificates].some((item) => !item.trim()) ||
    [
      input.innovationAbility,
      input.learningAbility,
      input.pressureResistance,
      input.communicationAbility,
      input.internshipAbility,
    ].some((item) => item === "")
  );
}

function formatSourceType(sourceType: StudentProfileRecord["source_type"]): string {
  return sourceType === "manual" ? "表单录入" : "简历上传";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString("zh-CN", { hour12: false });
}

function mapSelfAssessmentLevel(score: number): string {
  if (score >= 5) {
    return "很强";
  }
  if (score >= 4) {
    return "较强";
  }
  if (score >= 3) {
    return "中等";
  }
  return "需提升";
}

function normalizeCapabilityLevel(value: number | "", fallback = 3): number {
  return typeof value === "number" ? value : fallback;
}

function selectProfile(profileId: number): void {
  selectedProfileId.value = profileId;
}

/**
 * 作用：按用户输入的关键字拉取岗位建议。
 * 注意：建议列表只是辅助输入，不应阻塞简历上传主流程，因此失败时静默回退为空列表。
 */
async function loadResumeTargetRoleOptions(keyword: string): Promise<void> {
  const normalizedKeyword = keyword.trim();
  if (normalizedKeyword.length < 2) {
    resumeUpload.targetRoleOptions = [];
    return;
  }

  loading.resumeTargetRoleSearch = true;
  try {
    const response = await fetchJobs({
      keyword: normalizedKeyword,
      limit: 8,
    });
    resumeUpload.targetRoleOptions = Array.from(
      new Set(response.items.map((item) => item.title.trim()).filter(Boolean)),
    );
  } catch {
    resumeUpload.targetRoleOptions = [];
  } finally {
    loading.resumeTargetRoleSearch = false;
  }
}

/**
 * 统一构建“画像维度展示”数据。
 * 说明：页面展示不直接暴露原始 JSON 结构，减少前端模板与后端字段耦合。
 */
function buildProfileCapabilityEntries(profile: StudentProfileRecord): CapabilityEntry[] {
  return [
    {
      label: "证书",
      value: profile.certificates.length > 0 ? profile.certificates.join("、") : "未填写",
    },
    {
      label: "沟通能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.communication)}（${profile.self_assessment.communication}/5）`,
    },
    {
      label: "学习能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.learning)}（${profile.self_assessment.learning}/5）`,
    },
    {
      label: "抗压能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.stress_tolerance)}（${profile.self_assessment.stress_tolerance}/5）`,
    },
    {
      label: "创新能力",
      value: `${mapSelfAssessmentLevel(profile.self_assessment.innovation)}（${profile.self_assessment.innovation}/5）`,
    },
    {
      label: "项目经历",
      value: `${profile.experience.project_count} 段`,
    },
    {
      label: "实习经历",
      value: `${profile.experience.internship_count} 段`,
    },
  ];
}

async function loadProfileHistory(): Promise<void> {
  loading.profileBootstrap = true;
  try {
    const response = await fetchStudentProfiles();
    profileRecords.value = response.items;
    if (!response.items.some((item) => item.id === selectedProfileId.value)) {
      selectedProfileId.value = response.items[0]?.id ?? null;
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.profileBootstrap = false;
  }
}

async function loadResumeHistory(): Promise<void> {
  loading.resumeHistory = true;
  try {
    const response = await listResumeHtmlRecords(0, 20);
    resumeHistory.value = response.items;
  } catch (error) {
    uiState.resumeError = formatApiError(error);
  } finally {
    loading.resumeHistory = false;
  }
}

/**
 * 提交“表单录入”并写入数据库画像。
 * 说明：能力文本会作为补充摘要拼接保存，同时将可量化字段映射为后端评分输入。
 */
async function submitManualProfile(): Promise<void> {
  resetProfileMessage();

  const name = manualForm.name.trim();
  const targetRole = manualForm.targetRole.trim();
  const skills = parseTagText(manualForm.skills);
  if (!name || !targetRole || skills.length === 0 || hasEmptyCapability(manualCapability)) {
    uiState.error =
      "请完整填写姓名、目标岗位、专业技能，以及证书/创新/学习/抗压/沟通/实习能力信息。";
    return;
  }

  loading.manualSubmit = true;
  try {
    const created = await createStudentProfile({
      name,
      target_role: targetRole,
      education_level: manualForm.education.trim() || undefined,
      skills,
      certificates: parseTagText(manualCapability.certificates),
      experience: {
        internship_count: normalizeCapabilityLevel(manualCapability.internshipAbility),
        project_count: manualForm.projects.trim() ? 1 : 0,
        competition_count:
          normalizeCapabilityLevel(manualCapability.innovationAbility) >= 4 ? 1 : 0,
      },
      self_assessment: {
        communication: normalizeCapabilityLevel(manualCapability.communicationAbility),
        learning: normalizeCapabilityLevel(manualCapability.learningAbility),
        stress_tolerance: normalizeCapabilityLevel(manualCapability.pressureResistance),
        innovation: normalizeCapabilityLevel(manualCapability.innovationAbility),
      },
      personal_summary: [
        manualForm.summary.trim(),
        `创新能力等级：${normalizeCapabilityLevel(manualCapability.innovationAbility)}`,
        `学习能力等级：${normalizeCapabilityLevel(manualCapability.learningAbility)}`,
        `抗压能力等级：${normalizeCapabilityLevel(manualCapability.pressureResistance)}`,
        `沟通能力等级：${normalizeCapabilityLevel(manualCapability.communicationAbility)}`,
        `实习能力等级：${normalizeCapabilityLevel(manualCapability.internshipAbility)}`,
      ]
        .filter(Boolean)
        .join("；"),
    });

    profileRecords.value.unshift(created);
    selectedProfileId.value = created.id;
    uiState.success = `画像已生成并写入数据库（ID: ${created.id}）。`;

    manualForm.name = "";
    manualForm.targetRole = "";
    manualForm.education = "";
    manualForm.skills = "";
    manualForm.projects = "";
    manualForm.summary = "";
    manualCapability.certificates = "";
    manualCapability.innovationAbility = "";
    manualCapability.learningAbility = "";
    manualCapability.pressureResistance = "";
    manualCapability.communicationAbility = "";
    manualCapability.internshipAbility = "";
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.manualSubmit = false;
  }
}

/**
 * 上传简历并调用后端解析生成画像。
 * 注意：该接口会直接落库，提交成功后可在“历史画像”看到完整记录。
 */
async function submitResumeProfile(): Promise<void> {
  resetProfileMessage();

  if (!resumeFile.value) {
    uiState.error = "请先选择简历文件。";
    return;
  }

  loading.resumeSubmit = true;
  try {
    const created = await createStudentProfileFromResume({
      file: resumeFile.value,
      // 优先提交用户选定的数据库岗位；未填写时交给后端自动解析和归一。
      targetRole: resumeUpload.targetRole.trim() || "待定岗位",
      name: undefined,
      parseMode: "tolerant",
    });

    profileRecords.value.unshift(created);
    selectedProfileId.value = created.id;
    uiState.success = `简历解析完成，画像已写入数据库（ID: ${created.id}）。`;

    resumeFile.value = null;
    resumeUpload.targetRole = "";
    resumeUpload.targetRoleOptions = [];
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeSubmit = false;
  }
}

function buildResumeRequestPayload(): CreateResumeHtmlRequest {
  return {
    basic: {
      name: resumeBuilder.basic.name.trim(),
      phone: resumeBuilder.basic.phone.trim(),
      email: resumeBuilder.basic.email.trim(),
      target_position: resumeBuilder.basic.targetPosition.trim(),
    },
    summary: resumeBuilder.summary.trim() || undefined,
    educations: [
      {
        school: resumeBuilder.education.school.trim(),
        major: resumeBuilder.education.major.trim(),
        degree: resumeBuilder.education.degree.trim(),
        period: resumeBuilder.education.period.trim(),
      },
    ],
    experiences: [
      {
        organization: resumeBuilder.experience.organization.trim(),
        role: resumeBuilder.experience.role.trim(),
        period: resumeBuilder.experience.period.trim(),
        responsibilities: resumeBuilder.experience.responsibilities.trim(),
        achievements: resumeBuilder.experience.achievements.trim(),
      },
    ],
    skills: resumeBuilder.skills.trim(),
  };
}

function validateResumeBuilder(): string[] {
  const errors: string[] = [];
  if (!resumeBuilder.basic.name.trim()) {
    errors.push("请填写姓名");
  }
  if (!resumeBuilder.basic.phone.trim()) {
    errors.push("请填写电话");
  }
  if (!resumeBuilder.basic.email.trim()) {
    errors.push("请填写邮箱");
  }
  if (!resumeBuilder.basic.targetPosition.trim()) {
    errors.push("请填写目标职位");
  }
  if (
    !resumeBuilder.education.school.trim() ||
    !resumeBuilder.education.major.trim() ||
    !resumeBuilder.education.degree.trim() ||
    !resumeBuilder.education.period.trim()
  ) {
    errors.push("请完整填写教育背景");
  }
  if (
    !resumeBuilder.experience.organization.trim() ||
    !resumeBuilder.experience.role.trim() ||
    !resumeBuilder.experience.period.trim() ||
    !resumeBuilder.experience.responsibilities.trim() ||
    !resumeBuilder.experience.achievements.trim()
  ) {
    errors.push("请完整填写工作/项目经历");
  }
  if (!resumeBuilder.skills.trim()) {
    errors.push("请填写专业技能");
  }
  return errors;
}

async function generateResumeWithAgent(): Promise<void> {
  resetResumeMessage();
  const errors = validateResumeBuilder();
  if (errors.length > 0) {
    uiState.resumeError = errors.join("；");
    return;
  }

  loading.resumeGenerate = true;
  try {
    const response = await createResumeHtml(buildResumeRequestPayload());
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = response.html;
    uiState.resumeSuccess = `简历已生成（ID: ${response.resume_id}），已在当前页预览。`;
    await loadResumeHistory();
  } catch (error) {
    uiState.resumeError = formatApiError(error);
  } finally {
    loading.resumeGenerate = false;
  }
}

async function openResumeHistoryItem(resumeId: number): Promise<void> {
  resetResumeMessage();
  loading.resumePreviewLoad = true;
  try {
    const record = await getResumeHtmlRecord(resumeId);
    resumePreviewVisible.value = true;
    resumePreviewHtml.value = record.html;
    uiState.resumeSuccess = `历史简历 #${record.id} 已在当前页预览。`;
  } catch (error) {
    uiState.resumeError = formatApiError(error);
  } finally {
    loading.resumePreviewLoad = false;
  }
}

function onResumeChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  resumeFile.value = input.files && input.files[0] ? input.files[0] : null;
}

onMounted(async () => {
  await Promise.all([loadProfileHistory(), loadResumeHistory()]);
});

watch(
  () => resumeUpload.targetRole,
  (value) => {
    void loadResumeTargetRoleOptions(value);
  },
);
</script>

<template>
  <section class="profile-page">
    <header class="hero">
      <p class="hero-tag">Student Profile Studio</p>
      <h2>学生画像中心</h2>
      <p class="hero-desc">
        本页统一承载简历生成、学生画像构建和历史画像回看，数据均可落库并复用。
      </p>
    </header>

    <section class="panel">
      <div class="section-head">
        <h3>简历生成（用于学生画像构建）</h3>
        <button
          class="ghost-btn"
          type="button"
          @click="resumeBuilderExpanded = !resumeBuilderExpanded"
        >
          {{ resumeBuilderExpanded ? "收起简历生成" : "展开简历生成" }}
        </button>
      </div>
      <p class="section-desc">先生成标准化简历文本，后续可用于上传解析或人工补录画像。</p>

      <p v-if="!resumeBuilderExpanded" class="mode-subtitle">
        默认收起，点击“展开简历生成”后可填写并生成。
      </p>

      <div v-if="resumeBuilderExpanded">
        <p v-if="uiState.resumeError" class="notice notice-error">{{ uiState.resumeError }}</p>
        <p v-if="uiState.resumeSuccess" class="notice notice-success">
          {{ uiState.resumeSuccess }}
        </p>

        <div class="grid two-col">
          <label>
            姓名
            <input v-model="resumeBuilder.basic.name" type="text" placeholder="例如：张三" />
          </label>
          <label>
            目标岗位
            <input
              v-model="resumeBuilder.basic.targetPosition"
              type="text"
              placeholder="例如：Java 开发工程师"
            />
          </label>
        </div>

        <div class="grid two-col">
          <label>
            电话
            <input
              v-model="resumeBuilder.basic.phone"
              type="text"
              placeholder="例如：138xxxx1234"
            />
          </label>
          <label>
            邮箱
            <input
              v-model="resumeBuilder.basic.email"
              type="email"
              placeholder="例如：name@email.com"
            />
          </label>
        </div>

        <div class="grid two-col">
          <label>
            学校
            <input
              v-model="resumeBuilder.education.school"
              type="text"
              placeholder="例如：XXXXX大学"
            />
          </label>
          <label>
            专业
            <input
              v-model="resumeBuilder.education.major"
              type="text"
              placeholder="例如：软件工程"
            />
          </label>
        </div>

        <div class="grid two-col">
          <label>
            学历
            <input v-model="resumeBuilder.education.degree" type="text" placeholder="例如：本科" />
          </label>
          <label>
            教育时间
            <input
              v-model="resumeBuilder.education.period"
              type="text"
              placeholder="例如：2018.09 - 2022.06"
            />
          </label>
        </div>

        <div class="grid two-col">
          <label>
            公司/项目
            <input
              v-model="resumeBuilder.experience.organization"
              type="text"
              placeholder="例如：XX 科技"
            />
          </label>
          <label>
            岗位
            <input
              v-model="resumeBuilder.experience.role"
              type="text"
              placeholder="例如：后端开发工程师"
            />
          </label>
        </div>

        <div class="grid two-col">
          <label>
            经历时间
            <input
              v-model="resumeBuilder.experience.period"
              type="text"
              placeholder="例如：2022.07 - 2025.03"
            />
          </label>
          <label>
            专业技能
            <input
              v-model="resumeBuilder.skills"
              type="text"
              placeholder="例如：Java Spring PostgreSQL"
            />
          </label>
        </div>

        <label>
          主要职责
          <textarea
            v-model="resumeBuilder.experience.responsibilities"
            rows="3"
            placeholder="例如：负责核心服务开发与性能优化"
          />
        </label>

        <label>
          工作成果
          <textarea
            v-model="resumeBuilder.experience.achievements"
            rows="3"
            placeholder="例如：将核心接口响应从 300ms 优化到 90ms"
          />
        </label>

        <label>
          个人总结（可选）
          <textarea
            v-model="resumeBuilder.summary"
            rows="3"
            placeholder="例如：3 年后端经验，具备微服务拆分与高并发治理实践"
          />
        </label>

        <div class="action-row">
          <button
            class="primary-btn"
            :disabled="loading.resumeGenerate"
            @click="generateResumeWithAgent"
          >
            {{ loading.resumeGenerate ? "简历生成中..." : "生成简历" }}
          </button>
          <button class="ghost-btn" :disabled="loading.resumeHistory" @click="loadResumeHistory">
            {{ loading.resumeHistory ? "刷新中..." : "刷新简历历史" }}
          </button>
        </div>
      </div>

      <p v-if="!resumeBuilderExpanded && uiState.resumeError" class="notice notice-error">
        {{ uiState.resumeError }}
      </p>
      <p v-if="!resumeBuilderExpanded && uiState.resumeSuccess" class="notice notice-success">
        {{ uiState.resumeSuccess }}
      </p>

      <div v-if="resumePreviewVisible" class="resume-preview">
        <div class="resume-preview-header">
          <h4>简历预览</h4>
          <button class="ghost-btn" type="button" @click="resumePreviewVisible = false">
            收起预览
          </button>
        </div>
        <iframe class="resume-preview-frame" :srcdoc="resumePreviewHtml" title="简历预览" />
      </div>

      <div class="history-header">
        <h4>历史简历（数据库）</h4>
      </div>
      <ul class="history-list">
        <li v-for="item in resumeHistory" :key="item.id">
          <div>
            <p class="history-title">
              #{{ item.id }} {{ item.basic_name }} · {{ item.target_position }}
            </p>
            <p class="history-meta">
              {{ item.model || "未知模型" }} ｜ {{ formatDate(item.created_at) }} ｜ trace_id:
              {{ item.trace_id }}
            </p>
          </div>
          <button
            class="ghost-btn"
            :disabled="loading.resumePreviewLoad"
            @click="openResumeHistoryItem(item.id)"
          >
            预览
          </button>
        </li>
        <li v-if="resumeHistory.length === 0" class="empty">暂无历史简历记录</li>
      </ul>
    </section>

    <section class="panel capability-intro">
      <h3>能力画像生成说明</h3>
      <p>
        学生就业能力来源通过简历上传或自行录入方式输入，系统会通过大模型能力将录入信息拆解为学生就业能力画像，
        并给出完整度与竞争力评分（画像结果写入数据库，可在下方历史区回看）。
      </p>
      <p class="capability-title">
        请在下方表单中输入这些维度信息：专业技能、证书、创新能力、学习能力、抗压能力、沟通能力、实习能力。
      </p>
    </section>

    <section class="mode-selector panel">
      <button class="mode-card" :class="{ active: mode === 'manual' }" @click="mode = 'manual'">
        <p class="mode-title">表单输入学生画像</p>
        <p class="mode-subtitle">手动填写信息，不上传简历，直接生成数据库画像</p>
      </button>
      <button class="mode-card" :class="{ active: mode === 'resume' }" @click="mode = 'resume'">
        <p class="mode-title">上传简历生成画像</p>
        <p class="mode-subtitle">只上传简历，不再手填信息，自动解析生成画像</p>
      </button>
    </section>

    <p v-if="uiState.error" class="notice notice-error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice notice-success">{{ uiState.success }}</p>

    <section class="content-layout">
      <article class="panel form-panel">
        <h3>{{ mode === "manual" ? "表单录入" : "简历上传" }}</h3>

        <template v-if="mode === 'manual'">
          <div class="grid two-col">
            <label>
              姓名
              <input v-model="manualForm.name" type="text" placeholder="例如：张三" />
            </label>
            <label>
              目标岗位
              <input
                v-model="manualForm.targetRole"
                type="text"
                placeholder="例如：前端开发工程师"
              />
            </label>
          </div>

          <div class="grid two-col">
            <label>
              教育背景（可选）
              <input
                v-model="manualForm.education"
                type="text"
                placeholder="例如：计算机科学与技术 本科"
              />
            </label>
            <label>
              专业技能（必填）
              <input v-model="manualForm.skills" type="text" placeholder="Vue TypeScript 测试" />
            </label>
          </div>

          <div class="grid two-col">
            <label>
              证书（必填）
              <input
                v-model="manualCapability.certificates"
                type="text"
                placeholder="例如：英语六级、软考中级"
              />
            </label>
            <label>
              创新能力（必选）
              <select v-model="manualCapability.innovationAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`innovation-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="grid two-col">
            <label>
              学习能力（必选）
              <select v-model="manualCapability.learningAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`learning-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              抗压能力（必选）
              <select v-model="manualCapability.pressureResistance">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`stress-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="grid two-col">
            <label>
              沟通能力（必选）
              <select v-model="manualCapability.communicationAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`communication-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              实习能力（必选）
              <select v-model="manualCapability.internshipAbility">
                <option :value="''">请选择等级</option>
                <option
                  v-for="option in capabilityLevelOptions"
                  :key="`internship-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <label>
            项目经历（可选）
            <textarea
              v-model="manualForm.projects"
              rows="3"
              placeholder="可输入项目名称、职责、成果，提升竞争力评分。"
            />
          </label>

          <label>
            个人摘要（可选）
            <textarea
              v-model="manualForm.summary"
              rows="3"
              placeholder="一句话总结你的优势和求职诉求。"
            />
          </label>

          <button class="primary-btn" :disabled="loading.manualSubmit" @click="submitManualProfile">
            {{ loading.manualSubmit ? "生成中..." : "生成画像并入库" }}
          </button>
        </template>

        <template v-else>
          <label>
            简历文件
            <input type="file" accept=".pdf,.doc,.docx,.txt,.md" @change="onResumeChange" />
          </label>

          <label>
            目标岗位（建议选择数据库岗位）
            <input
              v-model="resumeUpload.targetRole"
              type="text"
              list="resume-target-role-options"
              placeholder="例如：前端开发工程师"
            />
            <datalist id="resume-target-role-options">
              <option v-for="item in resumeUpload.targetRoleOptions" :key="item" :value="item" />
            </datalist>
          </label>

          <p class="mode-hint">
            系统会优先使用你选择的数据库岗位；若留空，则会尝试从简历中自动解析并映射到数据库岗位。
            <span v-if="loading.resumeTargetRoleSearch">岗位建议加载中...</span>
          </p>

          <button class="primary-btn" :disabled="loading.resumeSubmit" @click="submitResumeProfile">
            {{ loading.resumeSubmit ? "解析中..." : "上传并生成画像" }}
          </button>
        </template>
      </article>

      <aside class="panel preview-panel">
        <h3>实时画像预览</h3>

        <div v-if="latestProfile" class="preview-card">
          <p class="preview-headline">#{{ latestProfile.id }} {{ latestProfile.name }}</p>
          <p class="preview-meta">
            来源：{{ formatSourceType(latestProfile.source_type) }} ｜ 目标岗位：{{
              latestProfile.target_role
            }}
          </p>
          <p class="preview-summary">{{ latestProfile.summary }}</p>

          <div class="score-grid">
            <div>
              <p class="score-label">完整度</p>
              <p class="score-value">{{ latestProfile.completeness_score }}</p>
            </div>
            <div>
              <p class="score-label">竞争力</p>
              <p class="score-value">{{ latestProfile.competitiveness_score }}</p>
            </div>
          </div>

          <div class="skill-tags">
            <span v-for="skill in latestProfile.skills" :key="skill">{{ skill }}</span>
          </div>

          <div class="capability-list">
            <p class="capability-list-title">画像维度结果</p>
            <ul>
              <li v-for="item in buildProfileCapabilityEntries(latestProfile)" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </li>
            </ul>
          </div>

          <p class="preview-time">生成时间：{{ formatDate(latestProfile.created_at) }}</p>
        </div>

        <p v-else class="empty">请先完成一次提交，右侧会展示最新的数据库画像结果。</p>
      </aside>
    </section>

    <section class="panel history-panel">
      <div class="history-header">
        <h3>历史画像（数据库）</h3>
        <button class="ghost-btn" :disabled="loading.profileBootstrap" @click="loadProfileHistory">
          {{ loading.profileBootstrap ? "刷新中..." : "刷新历史" }}
        </button>
      </div>

      <ul class="history-list">
        <li
          v-for="item in profileRecords"
          :key="item.id"
          :class="{ active: latestProfile?.id === item.id }"
        >
          <div>
            <p class="history-title">#{{ item.id }} {{ item.name }} · {{ item.target_role }}</p>
            <p class="history-meta">
              {{ formatSourceType(item.source_type) }} ｜ 完整度 {{ item.completeness_score }} ｜
              竞争力 {{ item.competitiveness_score }} ｜ {{ formatDate(item.created_at) }}
            </p>
          </div>
          <div class="history-actions">
            <button class="ghost-btn" @click="selectProfile(item.id)">查看预览</button>
            <button
              class="ghost-btn"
              @click="
                selectProfile(item.id);
                mode = item.source_type === 'manual' ? 'manual' : 'resume';
              "
            >
              切换到对应入口
            </button>
          </div>
        </li>
        <li v-if="profileRecords.length === 0" class="empty">暂无记录</li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.profile-page {
  --profile-bg:
    radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.88), transparent 28%),
    radial-gradient(circle at 88% 14%, rgba(164, 243, 255, 0.46), transparent 26%),
    radial-gradient(circle at 72% 86%, rgba(255, 206, 236, 0.42), transparent 24%),
    linear-gradient(145deg, #dff4ff 0%, #edf4ff 34%, #f8f6ff 70%, #fff4ef 100%);
  --profile-card: linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.22));
  --profile-card-strong: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.78),
    rgba(255, 255, 255, 0.32)
  );
  --profile-border: rgba(255, 255, 255, 0.56);
  --profile-title: #11233f;
  --profile-subtitle: rgba(37, 55, 88, 0.74);
  --profile-primary: #1587a5;
  --profile-primary-strong: #2357d8;
  --profile-shadow: 0 28px 64px rgba(34, 62, 110, 0.16);
  max-width: 1180px;
  margin: 24px auto;
  padding: 28px;
  border-radius: 34px;
  background: var(--profile-bg);
  display: grid;
  gap: 18px;
  position: relative;
  overflow: hidden;
  box-shadow: var(--profile-shadow);
  isolation: isolate;
  animation: page-enter 420ms ease-out;
}

.profile-page::before,
.profile-page::after {
  content: "";
  position: absolute;
  border-radius: 999px;
  filter: blur(12px);
  z-index: -1;
  pointer-events: none;
}

.profile-page::before {
  width: 320px;
  height: 320px;
  top: -72px;
  right: -56px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0) 72%);
}

.profile-page::after {
  width: 280px;
  height: 280px;
  left: -80px;
  bottom: 36px;
  background: radial-gradient(circle, rgba(129, 212, 250, 0.34) 0%, rgba(129, 212, 250, 0) 76%);
}

.hero {
  border: 1px solid var(--profile-border);
  border-radius: 28px;
  padding: 28px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.18));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.22),
    0 22px 46px rgba(36, 64, 118, 0.12);
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.48), transparent 42%),
    radial-gradient(circle at 85% 20%, rgba(255, 255, 255, 0.4), transparent 28%);
  pointer-events: none;
}

.hero-tag {
  margin: 0;
  color: rgba(17, 35, 63, 0.58);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 800;
}

.hero h2 {
  margin: 8px 0 0;
  color: var(--profile-title);
  font-size: 34px;
  line-height: 1.2;
  letter-spacing: -0.03em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.hero-desc {
  margin: 12px 0 0;
  color: var(--profile-subtitle);
  max-width: 760px;
  line-height: 1.8;
}

.panel {
  border: 1px solid var(--profile-border);
  border-radius: 24px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  background: var(--profile-card);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.64),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18),
    0 18px 38px rgba(42, 71, 120, 0.1);
}

.panel::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent 28%);
  pointer-events: none;
}

.capability-intro h3 {
  margin: 0;
  color: var(--profile-title);
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.capability-intro p {
  margin: 10px 0 0;
  color: rgba(31, 52, 86, 0.84);
  line-height: 1.7;
}

.capability-title {
  font-weight: 700;
  color: #122546;
}

.section-desc {
  margin: 10px 0 14px;
  color: var(--profile-subtitle);
  line-height: 1.75;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.section-head h3 {
  margin: 0;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
  color: var(--profile-title);
}

.mode-selector {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mode-card {
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 20px;
  padding: 18px;
  background: var(--profile-card-strong);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition:
    transform 220ms ease,
    border-color 180ms ease,
    box-shadow 220ms ease,
    background 220ms ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64);
}

.mode-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, rgba(255, 255, 255, 0.4), transparent 48%);
  pointer-events: none;
}

.mode-card:hover {
  transform: translateY(-4px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    0 18px 36px rgba(46, 79, 138, 0.12);
}

.mode-card.active {
  border-color: rgba(113, 197, 255, 0.92);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(222, 241, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 0 0 1px rgba(99, 170, 255, 0.16),
    0 20px 38px rgba(74, 118, 197, 0.16);
}

.mode-title {
  margin: 0;
  color: var(--profile-title);
  font-weight: 800;
}

.mode-subtitle {
  margin: 6px 0 0;
  color: var(--profile-subtitle);
  font-size: 13px;
  line-height: 1.65;
}

.notice {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.notice-error {
  background: linear-gradient(135deg, rgba(255, 232, 236, 0.82), rgba(255, 244, 245, 0.5));
  color: #8c2343;
}

.notice-success {
  background: linear-gradient(135deg, rgba(227, 255, 244, 0.78), rgba(241, 255, 251, 0.44));
  color: #0b6b54;
}

.content-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 18px;
}

.form-panel h3,
.preview-panel h3,
.history-panel h3 {
  margin: 0 0 12px;
  color: var(--profile-title);
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.grid {
  display: grid;
  gap: 12px;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 8px;
  color: rgba(28, 48, 82, 0.84);
  margin-bottom: 12px;
  font-weight: 600;
}

input,
textarea,
select {
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 14px;
  color: #16304e;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 10px 24px rgba(61, 90, 152, 0.06);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

input::placeholder,
textarea::placeholder {
  color: rgba(54, 79, 119, 0.5);
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: rgba(89, 178, 255, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 0 0 3px rgba(91, 164, 255, 0.14),
    0 14px 28px rgba(42, 75, 132, 0.1);
  transform: translateY(-1px);
}

textarea {
  resize: vertical;
  min-height: 104px;
}

.primary-btn,
.ghost-btn {
  border-radius: 16px;
  padding: 10px 14px;
  cursor: pointer;
  border: 1px solid transparent;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.primary-btn {
  background: linear-gradient(135deg, rgba(73, 182, 223, 0.92), rgba(64, 105, 236, 0.92));
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 16px 30px rgba(45, 99, 203, 0.24);
}

.ghost-btn {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.34));
  border-color: rgba(255, 255, 255, 0.62);
  color: #16304e;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 10px 20px rgba(46, 74, 118, 0.08);
}

.primary-btn:hover,
.ghost-btn:hover {
  transform: translateY(-1px);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

.preview-card {
  border: 1px solid rgba(255, 255, 255, 0.66);
  border-radius: 22px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.2));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.74),
    0 18px 34px rgba(54, 84, 140, 0.12);
}

.preview-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.44), transparent 44%),
    radial-gradient(circle at 82% 18%, rgba(158, 231, 255, 0.46), transparent 26%);
  pointer-events: none;
}

.preview-headline {
  margin: 0;
  color: var(--profile-title);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-family: "Avenir Next", "SF Pro Display", "PingFang SC", sans-serif;
}

.preview-meta,
.preview-time {
  margin: 10px 0 0;
  color: rgba(49, 73, 111, 0.68);
  font-size: 13px;
}

.preview-summary {
  margin: 14px 0 0;
  color: #1d3658;
  line-height: 1.8;
}

.score-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.score-grid > div {
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 18px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.3));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.score-label {
  margin: 0;
  color: rgba(56, 79, 115, 0.62);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.score-value {
  margin: 6px 0 0;
  color: #10284a;
  font-weight: 800;
  font-size: 28px;
}

.skill-tags {
  margin-top: 16px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.skill-tags span {
  padding: 7px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(215, 244, 255, 0.42));
  border: 1px solid rgba(169, 230, 255, 0.82);
  color: #17647b;
  font-size: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.capability-list {
  margin-top: 16px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 20px;
  padding: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.3));
}

.capability-list-title {
  margin: 0;
  color: #11233f;
  font-weight: 800;
}

.capability-list ul {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.capability-list li {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: flex-start;
  padding: 10px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.4);
}

.capability-list li:first-child {
  padding-top: 0;
  border-top: none;
}

.capability-list li span {
  color: rgba(58, 82, 117, 0.72);
  font-size: 13px;
}

.capability-list li strong {
  color: #1e3658;
  font-size: 13px;
  text-align: right;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
}

.history-header p {
  margin: 0;
  color: rgba(56, 80, 116, 0.68);
  font-size: 13px;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 14px 0 0;
  display: grid;
  gap: 10px;
}

.history-list li {
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 18px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.28));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.history-list li:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 14px 28px rgba(46, 76, 124, 0.1);
}

.history-list li.active {
  border-color: rgba(111, 196, 255, 0.9);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(220, 241, 255, 0.44));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 0 0 1px rgba(101, 178, 255, 0.14),
    0 18px 34px rgba(60, 100, 176, 0.14);
}

.history-title {
  margin: 0;
  color: #10284a;
  font-weight: 800;
}

.history-meta {
  margin: 6px 0 0;
  color: rgba(57, 82, 119, 0.68);
  font-size: 13px;
}

.history-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.empty {
  margin: 0;
  color: rgba(56, 80, 116, 0.74);
  text-align: center;
  padding: 16px;
}

.mode-hint {
  margin: 0 0 12px;
  color: var(--profile-subtitle);
  line-height: 1.7;
}

.action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.resume-preview {
  margin-top: 14px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.22));
  padding: 14px;
  display: grid;
  gap: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.resume-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.resume-preview-header h4 {
  margin: 0;
  color: var(--profile-title);
}

.resume-preview-frame {
  width: 100%;
  min-height: 640px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 18px;
  background: #ffffff;
}

@keyframes float-glass {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -4px, 0);
  }
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero,
.preview-card {
  animation: float-glass 8s ease-in-out infinite;
}

@media (max-width: 980px) {
  .profile-page {
    margin: 16px;
    padding: 14px;
  }

  .content-layout {
    grid-template-columns: 1fr;
  }

  .mode-selector,
  .two-col {
    grid-template-columns: 1fr;
  }

  .history-list li {
    flex-direction: column;
    align-items: flex-start;
  }

  .history-actions {
    width: 100%;
    justify-content: stretch;
  }

  .history-actions .ghost-btn {
    flex: 1 1 0;
  }
}

@media (max-width: 720px) {
  .profile-page {
    margin: 0;
    border-radius: 0;
    padding: 16px;
  }

  .hero {
    padding: 22px;
  }

  .hero h2 {
    font-size: 28px;
  }

  .preview-headline {
    font-size: 24px;
  }

  .resume-preview-header,
  .history-header,
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
