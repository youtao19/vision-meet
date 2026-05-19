<script setup lang="ts">
/**
 * 文件作用：学生画像中心。
 * 职责说明：承载简历解析、表单录入、画像查看和历史回看；AI 简历生成已拆到独立页面。
 * 依赖边界：本页只调用 profile API 和岗位建议 API，不处理简历 HTML 生成。
 */
import { computed, onMounted, reactive, ref, watch } from "vue";
import type { StudentProfileRecord } from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import { fetchJobs } from "@/shared/api/jobs";
import {
  createStudentProfile,
  createStudentProfileFromResume,
  fetchStudentProfiles,
} from "@/shared/api/profile";

type InputMode = "resume" | "manual";

interface CapabilityFormState {
  certificates: string;
  innovationAbility: number | "";
  learningAbility: number | "";
  pressureResistance: number | "";
  communicationAbility: number | "";
  internshipAbility: number | "";
}

interface AbilityMetric {
  key: string;
  label: string;
  value: number;
  note: string;
  tone: "primary" | "green" | "orange";
}

interface MissingCheck {
  label: string;
  status: "ok" | "warn";
}

const mode = ref<InputMode>("resume");
const profileRecords = ref<StudentProfileRecord[]>([]);
const selectedProfileId = ref<number | null>(null);
const resumeFile = ref<File | null>(null);

const loading = reactive({
  profileBootstrap: false,
  manualSubmit: false,
  resumeSubmit: false,
  resumeTargetRoleSearch: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

const manualForm = reactive({
  name: "",
  targetRole: "",
  education: "",
  skills: "",
  projects: "",
  summary: "",
});

const manualCapability = reactive<CapabilityFormState>({
  certificates: "",
  innovationAbility: "",
  learningAbility: "",
  pressureResistance: "",
  communicationAbility: "",
  internshipAbility: "",
});

const resumeUpload = reactive({
  targetRole: "",
  targetRoleOptions: [] as string[],
});

const capabilityLevelOptions = [
  { value: 1, label: "1 - 待提升" },
  { value: 2, label: "2 - 一般" },
  { value: 3, label: "3 - 良好" },
  { value: 4, label: "4 - 较强" },
  { value: 5, label: "5 - 优秀" },
];

const selectedProfile = computed(() => {
  if (selectedProfileId.value !== null) {
    return profileRecords.value.find((item) => item.id === selectedProfileId.value) ?? null;
  }
  return profileRecords.value[0] ?? null;
});

const abilityMetrics = computed<AbilityMetric[]>(() => {
  const profile = selectedProfile.value;
  if (!profile) return [];

  const learning = selfAssessmentToPercent(profile.self_assessment.learning);
  const stress = selfAssessmentToPercent(profile.self_assessment.stress_tolerance);
  const communication = selfAssessmentToPercent(profile.self_assessment.communication);

  return [
    {
      key: "base",
      label: "基础信息",
      value: clampPercent(profile.dimension_scores.base_requirements),
      note: "学历、专业、毕业年份",
      tone: "primary",
    },
    {
      key: "skills",
      label: "专业技能",
      value: clampPercent(profile.dimension_scores.professional_skills),
      note: "技能关键词与岗位相关度",
      tone: "green",
    },
    {
      key: "quality",
      label: "职业素养",
      value: averagePercent([profile.dimension_scores.professional_quality, communication]),
      note: "沟通、协作与表达",
      tone: "green",
    },
    {
      key: "potential",
      label: "发展潜力",
      value: averagePercent([profile.dimension_scores.development_potential, learning]),
      note: "学习能力与成长空间",
      tone: "orange",
    },
    {
      key: "stress",
      label: "抗压执行",
      value: stress,
      note: "自评量表换算",
      tone: "orange",
    },
  ];
});

const missingChecks = computed<MissingCheck[]>(() => {
  const profile = selectedProfile.value;
  if (!profile) return [];

  const missingLabels = new Set(profile.missing_items.map(mapMissingItem));
  const baseChecks = [
    "专业信息",
    "毕业年份",
    "技能关键词",
    "项目/实习经历",
    "证书奖项",
  ];

  return baseChecks.map((label) => ({
    label,
    status: missingLabels.has(label) ? "warn" : "ok",
  }));
});

const updateRecords = computed(() => profileRecords.value.slice(0, 4));

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
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试";
}

function resetProfileMessage(): void {
  uiState.error = "";
  uiState.success = "";
}

function hasEmptyCapability(input: CapabilityFormState): boolean {
  return (
    !input.certificates.trim() ||
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
  return sourceType === "manual" ? "表单录入" : "简历解析";
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function selfAssessmentToPercent(score: number): number {
  return clampPercent(score * 20);
}

function averagePercent(values: number[]): number {
  if (values.length === 0) return 0;
  return clampPercent(values.reduce((total, value) => total + value, 0) / values.length);
}

function normalizeCapabilityLevel(value: number | "", fallback = 3): number {
  return typeof value === "number" ? value : fallback;
}

function mapMissingItem(item: string): string {
  const fieldMap: Record<string, string> = {
    major: "专业信息",
    graduation_year: "毕业年份",
    skills: "技能关键词",
    education_level: "专业信息",
    experience: "项目/实习经历",
    certificates: "证书奖项",
  };
  return fieldMap[item] || item;
}

function selectProfile(profileId: number): void {
  selectedProfileId.value = profileId;
}

function onResumeChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  resumeFile.value = input.files && input.files[0] ? input.files[0] : null;
}

/**
 * 作用：为简历解析目标岗位提供数据库岗位建议。
 * 注意：建议失败时静默降级，避免影响上传解析主链路。
 */
async function loadResumeTargetRoleOptions(keyword: string): Promise<void> {
  const normalizedKeyword = keyword.trim();
  if (normalizedKeyword.length < 2) {
    resumeUpload.targetRoleOptions = [];
    return;
  }

  loading.resumeTargetRoleSearch = true;
  try {
    const response = await fetchJobs({ keyword: normalizedKeyword, limit: 8 });
    resumeUpload.targetRoleOptions = Array.from(
      new Set(response.items.map((item) => item.title.trim()).filter(Boolean)),
    );
  } catch {
    resumeUpload.targetRoleOptions = [];
  } finally {
    loading.resumeTargetRoleSearch = false;
  }
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

/**
 * 上传简历并解析为学生画像。
 * 注意：接口会直接写入画像库，成功后立即选中新画像。
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
      targetRole: resumeUpload.targetRole.trim() || "待定岗位",
      name: undefined,
      parseMode: "tolerant",
    });

    profileRecords.value.unshift(created);
    selectedProfileId.value = created.id;
    resumeFile.value = null;
    resumeUpload.targetRole = "";
    resumeUpload.targetRoleOptions = [];
    uiState.success = `简历解析完成，画像已写入数据库（ID: ${created.id}）。`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeSubmit = false;
  }
}

/**
 * 提交表单并生成学生画像。
 * 说明：能力量表会映射到后端自评字段，文本经历只作为摘要和计数证据。
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

onMounted(() => {
  void loadProfileHistory();
});

watch(
  () => resumeUpload.targetRole,
  (value) => {
    void loadResumeTargetRoleOptions(value);
  },
);
</script>

<template>
  <section class="profile-workbench">
    <header class="page-titlebar">
      <div>
        <p class="eyebrow">Student Profile</p>
        <h2>学生画像</h2>
        <p>通过简历解析或手动录入构建学生结构化画像，用于岗位匹配和职业规划。</p>
      </div>

      <div class="title-actions">
        <div class="segmented">
          <button :class="{ active: mode === 'resume' }" type="button" @click="mode = 'resume'">
            简历解析
          </button>
          <button :class="{ active: mode === 'manual' }" type="button" @click="mode = 'manual'">
            表单录入
          </button>
        </div>
        <button class="ghost-btn" type="button" :disabled="loading.profileBootstrap" @click="loadProfileHistory">
          {{ loading.profileBootstrap ? "刷新中..." : "刷新画像" }}
        </button>
      </div>
    </header>

    <p v-if="uiState.error" class="notice error">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice success">{{ uiState.success }}</p>

    <section class="profile-grid">
      <aside class="side-panel input-panel">
        <template v-if="mode === 'resume'">
          <div class="step-title">
            <span>1</span>
            <h3>上传简历</h3>
          </div>

          <label class="upload-box">
            <span class="material-symbols-outlined">cloud_upload</span>
            <strong>{{ resumeFile?.name || "点击选择简历文件" }}</strong>
            <small>支持 PDF、Word、TXT、Markdown</small>
            <input type="file" accept=".pdf,.doc,.docx,.txt,.md" @change="onResumeChange" />
          </label>

          <label class="field">
            <span>目标岗位</span>
            <input
              v-model="resumeUpload.targetRole"
              list="resume-target-role-options"
              type="text"
              placeholder="例如：Java 开发工程师"
            />
            <datalist id="resume-target-role-options">
              <option v-for="item in resumeUpload.targetRoleOptions" :key="item" :value="item" />
            </datalist>
          </label>

          <div class="step-title compact">
            <span>2</span>
            <h3>解析状态</h3>
          </div>
          <ul class="parse-status">
            <li :class="{ done: resumeFile }">文件已选择</li>
            <li :class="{ done: loading.resumeSubmit }">提交解析</li>
            <li :class="{ done: selectedProfile?.source_type === 'resume' }">写入画像库</li>
          </ul>

          <button class="primary-btn full" :disabled="loading.resumeSubmit" @click="submitResumeProfile">
            {{ loading.resumeSubmit ? "解析中..." : "上传并生成画像" }}
          </button>
        </template>

        <template v-else>
          <div class="step-title">
            <span>1</span>
            <h3>表单录入</h3>
          </div>

          <label class="field">
            <span>姓名</span>
            <input v-model="manualForm.name" type="text" placeholder="例如：张三" />
          </label>
          <label class="field">
            <span>目标岗位</span>
            <input v-model="manualForm.targetRole" type="text" placeholder="例如：前端开发工程师" />
          </label>
          <label class="field">
            <span>教育背景</span>
            <input v-model="manualForm.education" type="text" placeholder="例如：计算机科学与技术 本科" />
          </label>
          <label class="field">
            <span>专业技能</span>
            <textarea v-model="manualForm.skills" rows="3" placeholder="Vue TypeScript Node.js" />
          </label>
          <label class="field">
            <span>证书奖项</span>
            <textarea v-model="manualCapability.certificates" rows="2" placeholder="英语六级、计算机二级" />
          </label>
          <div class="rating-grid">
            <label>
              创新
              <select v-model="manualCapability.innovationAbility">
                <option :value="''">选择</option>
                <option v-for="item in capabilityLevelOptions" :key="`in-${item.value}`" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
            <label>
              学习
              <select v-model="manualCapability.learningAbility">
                <option :value="''">选择</option>
                <option v-for="item in capabilityLevelOptions" :key="`le-${item.value}`" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
            <label>
              抗压
              <select v-model="manualCapability.pressureResistance">
                <option :value="''">选择</option>
                <option v-for="item in capabilityLevelOptions" :key="`st-${item.value}`" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
            <label>
              沟通
              <select v-model="manualCapability.communicationAbility">
                <option :value="''">选择</option>
                <option v-for="item in capabilityLevelOptions" :key="`co-${item.value}`" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
            <label>
              实习
              <select v-model="manualCapability.internshipAbility">
                <option :value="''">选择</option>
                <option v-for="item in capabilityLevelOptions" :key="`it-${item.value}`" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>项目经历</span>
            <textarea v-model="manualForm.projects" rows="3" placeholder="填写项目名称、职责和成果" />
          </label>
          <label class="field">
            <span>个人摘要</span>
            <textarea v-model="manualForm.summary" rows="3" placeholder="一句话总结优势和求职诉求" />
          </label>

          <button class="primary-btn full" :disabled="loading.manualSubmit" @click="submitManualProfile">
            {{ loading.manualSubmit ? "保存中..." : "保存学生画像" }}
          </button>
        </template>
      </aside>

      <main class="detail-panel">
        <template v-if="selectedProfile">
          <section class="profile-card">
            <header class="profile-head">
              <div class="avatar">
                <span class="material-symbols-outlined">person</span>
              </div>
              <div>
                <p class="label">基础信息</p>
                <h3>{{ selectedProfile.name }}</h3>
                <p>
                  {{ selectedProfile.major || "专业未填写" }} ·
                  {{ selectedProfile.education_level || "学历未填写" }} ·
                  {{ selectedProfile.graduation_year || "毕业年份未填写" }}
                </p>
              </div>
              <span class="source-chip">{{ formatSourceType(selectedProfile.source_type) }}</span>
            </header>

            <div class="info-grid">
              <div>
                <span>目标岗位</span>
                <strong>{{ selectedProfile.target_role }}</strong>
              </div>
              <div>
                <span>画像 ID</span>
                <strong>#{{ selectedProfile.id }}</strong>
              </div>
              <div>
                <span>生成时间</span>
                <strong>{{ formatDate(selectedProfile.created_at) }}</strong>
              </div>
            </div>
          </section>

          <section class="content-card">
            <header class="section-line">
              <h3>专业技能</h3>
              <span>{{ selectedProfile.skills.length }} 项</span>
            </header>
            <div class="tag-list">
              <span v-for="skill in selectedProfile.skills" :key="skill">{{ skill }}</span>
              <span v-if="selectedProfile.skills.length === 0" class="empty-chip">暂无技能</span>
            </div>
          </section>

          <section class="content-card">
            <header class="section-line">
              <h3>经历与证书</h3>
              <span>项目 {{ selectedProfile.experience.project_count }} · 实习 {{ selectedProfile.experience.internship_count }}</span>
            </header>
            <div class="experience-grid">
              <div>
                <span>项目经历</span>
                <strong>{{ selectedProfile.experience.project_count }} 段</strong>
              </div>
              <div>
                <span>实习经历</span>
                <strong>{{ selectedProfile.experience.internship_count }} 段</strong>
              </div>
              <div>
                <span>竞赛经历</span>
                <strong>{{ selectedProfile.experience.competition_count }} 段</strong>
              </div>
            </div>
            <div class="tag-list certificates">
              <span v-for="item in selectedProfile.certificates" :key="item">{{ item }}</span>
              <span v-if="selectedProfile.certificates.length === 0" class="empty-chip">暂无证书</span>
            </div>
          </section>

          <section class="content-card">
            <header class="section-line">
              <h3>求职偏好与综合评价</h3>
            </header>
            <p class="summary-text">{{ selectedProfile.summary }}</p>
            <p v-if="selectedProfile.personal_summary" class="summary-text muted">
              {{ selectedProfile.personal_summary }}
            </p>
          </section>
        </template>

        <section v-else class="empty-detail">
          <span class="material-symbols-outlined">description</span>
          <h3>暂无学生画像</h3>
          <p>请先通过左侧简历解析或表单录入创建一条画像。</p>
        </section>
      </main>

      <aside class="side-panel insight-panel">
        <section class="score-card">
          <h3>画像完整度</h3>
          <div
            class="score-ring"
            :style="{ '--score': `${selectedProfile?.completeness_score ?? 0}%` }"
          >
            <strong>{{ selectedProfile?.completeness_score ?? 0 }}%</strong>
            <span>{{ (selectedProfile?.completeness_score ?? 0) >= 80 ? "较完整" : "待完善" }}</span>
          </div>
          <p>完善关键信息可提升岗位匹配准确度。</p>
        </section>

        <section class="insight-card">
          <h3>能力可信度</h3>
          <div v-for="item in abilityMetrics" :key="item.key" class="meter-row" :class="item.tone">
            <div>
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}%</strong>
            </div>
            <i><b :style="{ width: `${item.value}%` }"></b></i>
            <small>{{ item.note }}</small>
          </div>
          <p v-if="abilityMetrics.length === 0" class="empty-note">暂无可计算画像。</p>
        </section>

        <section class="insight-card">
          <h3>缺失信息检查</h3>
          <ul class="check-list">
            <li v-for="item in missingChecks" :key="item.label" :class="item.status">
              <span class="material-symbols-outlined">{{ item.status === "ok" ? "check_circle" : "warning" }}</span>
              {{ item.status === "ok" ? "已覆盖" : "待补充" }}{{ item.label }}
            </li>
          </ul>
        </section>

        <section class="insight-card">
          <h3>最近更新记录</h3>
          <ul class="update-list">
            <li v-for="item in updateRecords" :key="item.id">
              <span></span>
              <p>{{ formatSourceType(item.source_type) }}</p>
              <time>{{ formatDate(item.created_at) }}</time>
            </li>
            <li v-if="updateRecords.length === 0" class="empty-note">暂无更新记录</li>
          </ul>
        </section>
      </aside>
    </section>

    <section class="history-panel">
      <header class="section-line">
        <h3>历史画像</h3>
        <span>{{ profileRecords.length }} 条记录</span>
      </header>
      <div class="history-table">
        <button
          v-for="item in profileRecords"
          :key="item.id"
          type="button"
          :class="{ active: selectedProfile?.id === item.id }"
          @click="selectProfile(item.id)"
        >
          <span>#{{ item.id }}</span>
          <strong>{{ item.name }}</strong>
          <em>{{ item.target_role }}</em>
          <small>{{ formatSourceType(item.source_type) }}</small>
          <small>完整度 {{ item.completeness_score }}%</small>
          <small>{{ formatDate(item.created_at) }}</small>
        </button>
        <p v-if="profileRecords.length === 0" class="empty-note">暂无历史画像。</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.profile-workbench {
  min-width: 1120px;
  display: grid;
  gap: 14px;
}

.page-titlebar,
.profile-grid,
.history-panel,
.side-panel,
.detail-panel,
.content-card,
.profile-card,
.insight-card,
.score-card {
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

.eyebrow,
.label {
  margin: 0;
  color: rgba(37, 55, 88, 0.62);
  font-size: 12px;
  font-weight: 800;
}

.page-titlebar h2 {
  margin: 4px 0;
  color: var(--glass-title);
  font-size: 26px;
  letter-spacing: 0;
}

.page-titlebar p {
  margin: 0;
  color: var(--glass-muted);
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(2, 112px);
  padding: 3px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.64);
  background: rgba(255, 255, 255, 0.38);
}

.segmented button {
  height: 36px;
  border: 0;
  border-radius: 9px;
  color: var(--glass-title);
  background: transparent;
  cursor: pointer;
  font-weight: 800;
}

.segmented button.active {
  color: #fff;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
}

.profile-grid {
  padding: 12px;
  border-radius: 18px;
  display: grid;
  grid-template-columns: 310px minmax(480px, 1fr) 270px;
  gap: 12px;
  align-items: start;
}

.side-panel,
.detail-panel,
.history-panel {
  border-radius: 16px;
  padding: 16px;
}

.side-panel {
  min-height: 640px;
}

.detail-panel {
  display: grid;
  gap: 12px;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.step-title.compact {
  margin-top: 18px;
}

.step-title span {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
}

.step-title h3,
.score-card h3,
.insight-card h3,
.section-line h3 {
  margin: 0;
  color: var(--glass-title);
  font-size: 16px;
}

.upload-box {
  min-height: 190px;
  border: 1px dashed rgba(23, 135, 199, 0.42);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.32);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: var(--glass-title);
}

.upload-box input {
  display: none;
}

.upload-box .material-symbols-outlined {
  color: var(--glass-primary-strong);
  font-size: 42px;
}

.upload-box small,
.field span,
.meter-row small,
.section-line span,
.empty-note {
  color: var(--glass-muted);
  font-size: 12px;
}

.field {
  display: grid;
  gap: 7px;
  margin-top: 12px;
  color: var(--glass-title);
  font-weight: 800;
}

.field input,
.field textarea,
.rating-grid select {
  width: 100%;
  border: 1px solid rgba(31, 58, 97, 0.12);
  border-radius: 10px;
  padding: 10px 11px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.48);
  font-family: inherit;
}

.field textarea {
  resize: vertical;
}

.rating-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.rating-grid label {
  display: grid;
  gap: 6px;
  color: var(--glass-muted);
  font-size: 12px;
  font-weight: 800;
}

.parse-status,
.check-list,
.update-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.parse-status li {
  border-bottom: 1px solid rgba(255, 255, 255, 0.38);
  padding: 0 0 10px 22px;
  color: var(--glass-muted);
  position: relative;
}

.parse-status li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(37, 55, 88, 0.2);
}

.parse-status li.done::before {
  background: #16a34a;
}

.primary-btn,
.ghost-btn {
  height: 38px;
  border-radius: 10px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  cursor: pointer;
  font-weight: 800;
  font-family: inherit;
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

.full {
  width: 100%;
  margin-top: 16px;
}

.primary-btn:disabled,
.ghost-btn:disabled {
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

.profile-card,
.content-card {
  border-radius: 14px;
  padding: 16px;
}

.profile-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.avatar {
  width: 68px;
  height: 68px;
  border-radius: 24px;
  color: #fff;
  background: linear-gradient(135deg, var(--glass-primary), var(--glass-primary-strong));
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar .material-symbols-outlined {
  font-size: 38px;
}

.profile-head h3 {
  margin: 4px 0 5px;
  color: var(--glass-title);
  font-size: 24px;
}

.profile-head p {
  margin: 0;
  color: var(--glass-muted);
}

.source-chip {
  padding: 7px 11px;
  border-radius: 999px;
  color: var(--glass-primary-strong);
  background: rgba(255, 255, 255, 0.46);
  font-size: 12px;
  font-weight: 800;
}

.info-grid,
.experience-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.info-grid div,
.experience-grid div {
  padding: 11px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.36);
  display: grid;
  gap: 4px;
}

.info-grid span,
.experience-grid span {
  color: var(--glass-muted);
  font-size: 12px;
}

.section-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.tag-list span {
  padding: 6px 9px;
  border-radius: 8px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.42);
  font-size: 12px;
}

.tag-list.certificates span {
  color: var(--glass-primary-strong);
}

.empty-chip {
  color: var(--glass-muted) !important;
}

.summary-text {
  margin: 12px 0 0;
  color: var(--glass-title);
  line-height: 1.8;
}

.summary-text.muted {
  color: var(--glass-muted);
}

.empty-detail {
  min-height: 560px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: var(--glass-muted);
  background: rgba(255, 255, 255, 0.3);
}

.empty-detail .material-symbols-outlined {
  font-size: 44px;
}

.score-card,
.insight-card {
  padding: 14px;
  border-radius: 14px;
  margin-bottom: 12px;
}

.score-ring {
  width: 142px;
  height: 142px;
  margin: 18px auto 12px;
  border-radius: 999px;
  background: conic-gradient(var(--glass-primary-strong) var(--score), rgba(31, 58, 97, 0.1) 0);
  display: grid;
  place-items: center;
  position: relative;
}

.score-ring::before {
  content: "";
  position: absolute;
  inset: 12px;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.78);
}

.score-ring strong,
.score-ring span {
  position: relative;
  z-index: 1;
}

.score-ring strong {
  align-self: end;
  color: var(--glass-title);
  font-size: 30px;
}

.score-ring span {
  align-self: start;
  color: #16a34a;
  font-weight: 800;
}

.score-card p {
  color: var(--glass-muted);
  line-height: 1.7;
  text-align: center;
}

.meter-row {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.meter-row div {
  display: flex;
  justify-content: space-between;
  color: var(--glass-title);
  font-size: 13px;
}

.meter-row i {
  height: 7px;
  border-radius: 999px;
  background: rgba(31, 58, 97, 0.1);
  overflow: hidden;
}

.meter-row b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--glass-primary-strong);
}

.meter-row.green b {
  background: #16a34a;
}

.meter-row.orange b {
  background: #f59e0b;
}

.check-list li {
  min-height: 34px;
  border-radius: 9px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.38);
}

.check-list li.ok {
  color: #047857;
}

.check-list li.warn {
  color: #b45309;
}

.check-list .material-symbols-outlined {
  font-size: 18px;
}

.update-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  color: var(--glass-muted);
  font-size: 12px;
}

.update-list span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #16a34a;
}

.update-list p {
  margin: 0;
  color: var(--glass-title);
}

.history-panel {
  border-radius: 18px;
}

.history-table {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.history-table button {
  display: grid;
  grid-template-columns: 70px 1fr 1.3fr 110px 110px 130px;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  color: var(--glass-title);
  background: rgba(255, 255, 255, 0.32);
  text-align: left;
  cursor: pointer;
}

.history-table button.active {
  border-color: rgba(23, 135, 199, 0.56);
  background: rgba(255, 255, 255, 0.58);
}

.history-table span,
.history-table small {
  color: var(--glass-muted);
}

.history-table em {
  font-style: normal;
}
</style>
