<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import type {
  CreateStudentProfileRequest,
  ManualJobPortraitRecord,
  StudentProfileEvidence,
  StudentProfileExperienceItem,
  StudentProfileExperienceKind,
  StudentProfileRecord,
  StudentProfileSkill,
} from "@career/contracts/types";

import { ApiRequestError } from "@/shared/api/http";
import { fetchManualJobPortraits } from "@/shared/api/job-profiles";
import {
  createStudentProfile,
  createStudentProfileFromResume,
  fetchStudentProfiles,
} from "@/shared/api/profile";
import {
  profileCertificateNames,
  profileCompleteness,
  profileCompetitiveness,
  profileExperienceCount,
  profileName,
  profileSkillNames,
  profileTargetRole,
} from "@/features/profile/model/profile-selectors";

type InputMode = "resume" | "manual";
type SkillCategory = StudentProfileSkill["category"];

const mode = ref<InputMode>("resume");
const profileRecords = ref<StudentProfileRecord[]>([]);
const jobPortraits = ref<ManualJobPortraitRecord[]>([]);
const selectedProfileId = ref<number | null>(null);
const resumeFile = ref<File | null>(null);

const loading = reactive({
  bootstrap: false,
  manualSubmit: false,
  resumeSubmit: false,
  jobPortraits: false,
});

const uiState = reactive({
  error: "",
  success: "",
});

const resumeUpload = reactive({
  targetRole: "",
});

const manualForm = reactive({
  name: "",
  targetRole: "",
  preferredCities: "",
  preferredIndustries: "",
  school: "",
  educationLevel: "",
  major: "",
  graduationYear: "",
  skillText: "",
  certificateText: "",
  projectText: "",
  internshipText: "",
  competitionText: "",
  summary: "",
  communication: 3,
  learning: 3,
  stressTolerance: 3,
  innovation: 3,
});

const skillCategoryOptions: Array<{ value: SkillCategory; label: string }> = [
  { value: "backend", label: "后端" },
  { value: "frontend", label: "前端" },
  { value: "data", label: "数据" },
  { value: "ai", label: "AI" },
  { value: "testing", label: "测试" },
  { value: "tooling", label: "工具" },
  { value: "soft", label: "软技能" },
  { value: "other", label: "其他" },
];

const selectedSkillCategory = ref<SkillCategory>("other");
const sensitiveEvidenceFieldPattern =
  /(phone|mobile|tel|email|mail|qq|wechat|weixin|id_card|identity|contact|电话|邮箱|身份证|微信|联系方式)/i;
const sensitiveEvidenceQuotePattern =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(1[3-9]\d{9})/i;
const profileEvidenceFieldPattern =
  /^(basic_info\.name|preference\.|education|skills|certificates|experiences|self_assessment|summary)/;
const missingItemLabels: Record<string, string> = {
  "basic_info.name": "姓名",
  "education.school": "学校",
  "education.level": "学历",
  "education.major": "专业",
  "education.graduation_year": "毕业年份",
  skills: "专业技能",
  experiences: "项目/实习/竞赛经历",
  certificates: "证书奖项",
  evidences: "证据片段",
};
const evidenceFieldLabels: Record<string, string> = {
  "basic_info.name": "姓名",
  "preference.target_role": "目标岗位",
  "preference.target_city": "期望城市",
  "preference.preferred_cities": "期望城市",
  "preference.preferred_industries": "期望行业",
  "education.school": "学校",
  "education.level": "学历",
  "education.major": "专业",
  "education.graduation_year": "毕业年份",
  skills: "技能",
  certificates: "证书",
  experiences: "经历",
};

const selectedProfile = computed(() => {
  if (selectedProfileId.value !== null) {
    return profileRecords.value.find((item) => item.id === selectedProfileId.value) ?? null;
  }
  return profileRecords.value[0] ?? null;
});

const jobPortraitOptions = computed(() =>
  Array.from(new Set(jobPortraits.value.map((item) => item.job_name.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  ),
);

function isSensitiveEvidence(evidence: StudentProfileEvidence): boolean {
  return (
    sensitiveEvidenceFieldPattern.test(evidence.field_path) ||
    sensitiveEvidenceQuotePattern.test(evidence.quote)
  );
}

function isProfileEvidenceField(evidence: StudentProfileEvidence): boolean {
  return profileEvidenceFieldPattern.test(evidence.field_path);
}

function isHiddenEvidence(evidence: StudentProfileEvidence): boolean {
  return isSensitiveEvidence(evidence) || !isProfileEvidenceField(evidence);
}

function visibleEvidences(profile: StudentProfileRecord): StudentProfileEvidence[] {
  return profile.evidences.filter((item) => !isHiddenEvidence(item)).slice(0, 5);
}

function hiddenEvidenceCount(profile: StudentProfileRecord): number {
  return profile.evidences.filter(isHiddenEvidence).length;
}

function usableEvidenceCount(profile: StudentProfileRecord): number {
  return profile.evidences.filter((item) => !isHiddenEvidence(item)).length;
}

function formatEvidenceField(fieldPath: string): string {
  if (/^education(?:\[\d+\])?\.school$/.test(fieldPath)) return "学校";
  if (/^education(?:\[\d+\])?\.major$/.test(fieldPath)) return "专业";
  if (/^education(?:\[\d+\])?\.(degree|level)$/.test(fieldPath)) return "学历";
  if (/^education(?:\[\d+\])?\.gpa$/.test(fieldPath)) return "成绩";
  if (/^experiences(?:\[\d+\])?\.title$/.test(fieldPath)) return "经历";
  if (/^certificates(?:\[\d+\])?\.name$/.test(fieldPath)) return "证书";
  if (/^skills(?:\[\d+\])?\.name$/.test(fieldPath)) return "技能";
  return evidenceFieldLabels[fieldPath] || fieldPath;
}

function formatMissingItem(item: string): string {
  return missingItemLabels[item] || item;
}

function formatExperienceKind(kind: StudentProfileExperienceKind): string {
  const labels: Record<StudentProfileExperienceKind, string> = {
    project: "项目",
    internship: "实习",
    competition: "竞赛",
  };
  return labels[kind] || kind;
}

const dimensionCards = computed(() => {
  const profile = selectedProfile.value;
  if (!profile) return [];
  const scores = profile.evaluation.dimension_scores;
  return [
    { label: "基础要求", value: scores.base_requirements },
    { label: "职业技能", value: scores.professional_skills },
    { label: "职业素养", value: scores.professional_quality },
    { label: "发展潜力", value: scores.development_potential },
  ];
});

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[，,\n/|]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseYear(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : null;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.traceId ? `${error.message}（trace_id: ${error.traceId}）` : error.message;
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function formatSourceType(sourceType: StudentProfileRecord["source_type"]): string {
  return sourceType === "resume" ? "简历解析" : "表单录入";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildExperienceItems(
  kind: StudentProfileExperienceKind,
  raw: string,
): StudentProfileExperienceItem[] {
  return parseTags(raw).map((title) => ({
    kind,
    title,
    organization: null,
    role: null,
    period: null,
    tech_stack: [],
    responsibilities: [],
    outcomes: [],
    evidence_refs: [],
  }));
}

function buildManualPayload(): CreateStudentProfileRequest | null {
  const skills = parseTags(manualForm.skillText);
  if (!manualForm.name.trim() || skills.length === 0) {
    uiState.error = "请至少填写姓名和专业技能。";
    return null;
  }

  return {
    basic_info: {
      name: manualForm.name.trim(),
    },
    preference: {
      target_role: manualForm.targetRole.trim(),
      preferred_cities: parseTags(manualForm.preferredCities),
      preferred_industries: parseTags(manualForm.preferredIndustries),
    },
    education: {
      school: manualForm.school.trim() || null,
      level: manualForm.educationLevel.trim() || null,
      major: manualForm.major.trim() || null,
      graduation_year: parseYear(manualForm.graduationYear),
      evidence_refs: [],
    },
    skills: skills.map((name) => ({
      name,
      category: selectedSkillCategory.value,
      level: 3,
      evidence_refs: [],
    })),
    certificates: parseTags(manualForm.certificateText).map((name) => ({
      name,
      issuer: null,
      acquired_at: null,
      evidence_refs: [],
    })),
    experiences: [
      ...buildExperienceItems("project", manualForm.projectText),
      ...buildExperienceItems("internship", manualForm.internshipText),
      ...buildExperienceItems("competition", manualForm.competitionText),
    ] as NonNullable<CreateStudentProfileRequest["experiences"]>,
    self_assessment: {
      communication: manualForm.communication,
      learning: manualForm.learning,
      stress_tolerance: manualForm.stressTolerance,
      innovation: manualForm.innovation,
    },
    summary: manualForm.summary.trim() || undefined,
  };
}

function resetMessages(): void {
  uiState.error = "";
  uiState.success = "";
}

function resetManualForm(): void {
  manualForm.name = "";
  manualForm.targetRole = "";
  manualForm.preferredCities = "";
  manualForm.preferredIndustries = "";
  manualForm.school = "";
  manualForm.educationLevel = "";
  manualForm.major = "";
  manualForm.graduationYear = "";
  manualForm.skillText = "";
  manualForm.certificateText = "";
  manualForm.projectText = "";
  manualForm.internshipText = "";
  manualForm.competitionText = "";
  manualForm.summary = "";
  manualForm.communication = 3;
  manualForm.learning = 3;
  manualForm.stressTolerance = 3;
  manualForm.innovation = 3;
  selectedSkillCategory.value = "other";
}

async function loadProfileHistory(): Promise<void> {
  loading.bootstrap = true;
  resetMessages();
  try {
    const response = await fetchStudentProfiles();
    profileRecords.value = response.items;
    if (!response.items.some((item) => item.id === selectedProfileId.value)) {
      selectedProfileId.value = response.items[0]?.id ?? null;
    }
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.bootstrap = false;
  }
}

async function loadJobPortraitOptions(): Promise<void> {
  loading.jobPortraits = true;
  try {
    const response = await fetchManualJobPortraits();
    jobPortraits.value = response.items;
  } catch (error) {
    jobPortraits.value = [];
    uiState.error = formatApiError(error);
  } finally {
    loading.jobPortraits = false;
  }
}

function onResumeChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  resumeFile.value = input.files?.[0] ?? null;
}

async function submitResumeProfile(): Promise<void> {
  resetMessages();
  if (!resumeFile.value) {
    uiState.error = "请先选择简历文件。";
    return;
  }

  loading.resumeSubmit = true;
  try {
    const created = await createStudentProfileFromResume({
      file: resumeFile.value,
      targetRole: resumeUpload.targetRole.trim() || undefined,
      parseMode: "tolerant",
    });
    profileRecords.value.unshift(created);
    selectedProfileId.value = created.id;
    resumeFile.value = null;
    resumeUpload.targetRole = "";
    uiState.success = `学生画像已生成（ID: ${created.id}）。`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.resumeSubmit = false;
  }
}

async function submitManualProfile(): Promise<void> {
  resetMessages();
  const payload = buildManualPayload();
  if (!payload) return;

  loading.manualSubmit = true;
  try {
    const created = await createStudentProfile(payload);
    profileRecords.value.unshift(created);
    selectedProfileId.value = created.id;
    resetManualForm();
    uiState.success = `学生画像已保存（ID: ${created.id}）。`;
  } catch (error) {
    uiState.error = formatApiError(error);
  } finally {
    loading.manualSubmit = false;
  }
}

function selectProfile(profileId: number): void {
  selectedProfileId.value = profileId;
}

onMounted(() => {
  void loadProfileHistory();
  void loadJobPortraitOptions();
});
</script>

<template>
  <section class="profile-workbench">
    <header class="page-titlebar">
      <div class="title-copy">
        <p class="eyebrow">Student Profile</p>
        <h2>学生画像工作台</h2>
        <p>先沉淀学生能力、经历和证据；岗位目标留到匹配阶段再选择。</p>
      </div>
      <div class="title-actions">
        <div class="segmented" aria-label="画像创建方式">
          <button :class="{ active: mode === 'resume' }" type="button" @click="mode = 'resume'">
            <span class="material-symbols-outlined">upload_file</span>
            简历解析
          </button>
          <button :class="{ active: mode === 'manual' }" type="button" @click="mode = 'manual'">
            <span class="material-symbols-outlined">edit_note</span>
            表单录入
          </button>
        </div>
        <button class="ghost-btn" type="button" :disabled="loading.bootstrap" @click="loadProfileHistory">
          <span class="material-symbols-outlined">refresh</span>
          {{ loading.bootstrap ? "刷新中" : "刷新" }}
        </button>
      </div>
    </header>

    <p v-if="uiState.error" class="notice error" role="alert">{{ uiState.error }}</p>
    <p v-if="uiState.success" class="notice success" role="status">{{ uiState.success }}</p>

    <section class="workspace-grid">
      <aside class="side-rail">
        <section class="panel create-panel">
          <header class="panel-head">
            <div>
              <h3>{{ mode === "resume" ? "上传简历" : "结构化录入" }}</h3>
              <p>{{ mode === "resume" ? "由 Agent 抽取画像字段和证据" : "手动维护核心画像字段" }}</p>
            </div>
            <span>{{ mode === "resume" ? "Agent" : "Manual" }}</span>
          </header>

          <template v-if="mode === 'manual'">
            <div class="field-grid">
              <label><span>姓名</span><input v-model="manualForm.name" placeholder="张三" /></label>
              <label>
                <span>目标岗位（可选）</span>
                <select v-model="manualForm.targetRole" :disabled="loading.jobPortraits || jobPortraitOptions.length === 0">
                  <option value="">{{ loading.jobPortraits ? "岗位画像加载中" : "匹配时再选" }}</option>
                  <option v-for="item in jobPortraitOptions" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <label><span>学校</span><input v-model="manualForm.school" placeholder="XX 大学" /></label>
              <label><span>学历</span><input v-model="manualForm.educationLevel" placeholder="本科" /></label>
              <label><span>专业</span><input v-model="manualForm.major" placeholder="软件工程" /></label>
              <label><span>毕业年份</span><input v-model="manualForm.graduationYear" placeholder="2026" /></label>
            </div>

            <div class="field-row">
              <label><span>期望城市</span><input v-model="manualForm.preferredCities" placeholder="苏州、上海" /></label>
              <label><span>期望行业</span><input v-model="manualForm.preferredIndustries" placeholder="软件服务" /></label>
            </div>

            <label class="field">
              <span>技能分类</span>
              <select v-model="selectedSkillCategory">
                <option v-for="item in skillCategoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label class="field"><span>专业技能</span><textarea v-model="manualForm.skillText" rows="3" placeholder="Java、Spring、PostgreSQL" /></label>
            <label class="field"><span>证书奖项</span><textarea v-model="manualForm.certificateText" rows="2" placeholder="英语六级、蓝桥杯" /></label>
            <label class="field"><span>项目经历</span><textarea v-model="manualForm.projectText" rows="3" placeholder="招聘推荐系统、职业路径图谱" /></label>
            <label class="field"><span>实习经历</span><textarea v-model="manualForm.internshipText" rows="2" placeholder="后端开发实习" /></label>
            <label class="field"><span>竞赛经历</span><textarea v-model="manualForm.competitionText" rows="2" placeholder="数学建模、互联网+" /></label>

            <div class="rating-grid" aria-label="自评能力">
              <label><span>沟通</span><input v-model.number="manualForm.communication" type="range" min="1" max="5" /><b>{{ manualForm.communication }}</b></label>
              <label><span>学习</span><input v-model.number="manualForm.learning" type="range" min="1" max="5" /><b>{{ manualForm.learning }}</b></label>
              <label><span>抗压</span><input v-model.number="manualForm.stressTolerance" type="range" min="1" max="5" /><b>{{ manualForm.stressTolerance }}</b></label>
              <label><span>创新</span><input v-model.number="manualForm.innovation" type="range" min="1" max="5" /><b>{{ manualForm.innovation }}</b></label>
            </div>

            <label class="field"><span>摘要</span><textarea v-model="manualForm.summary" rows="3" placeholder="一句话说明优势和当前状态" /></label>
            <button class="primary-btn full" :disabled="loading.manualSubmit" @click="submitManualProfile">
              <span class="material-symbols-outlined">save</span>
              {{ loading.manualSubmit ? "保存中" : "保存画像" }}
            </button>
          </template>

          <template v-else>
            <label class="upload-box">
              <span class="material-symbols-outlined">cloud_upload</span>
              <strong>{{ resumeFile?.name || "选择简历文件" }}</strong>
              <small>支持 PDF 和 PNG/JPG/WebP 图片简历，Agent 会直接阅读图片并输出画像 JSON</small>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" @change="onResumeChange" />
            </label>

            <label class="field compact-field">
              <span>目标岗位（可选）</span>
              <select v-model="resumeUpload.targetRole" :disabled="loading.jobPortraits || jobPortraitOptions.length === 0">
                <option value="">{{ loading.jobPortraits ? "岗位画像加载中" : "匹配时再选" }}</option>
                <option v-for="item in jobPortraitOptions" :key="item" :value="item">{{ item }}</option>
              </select>
              <small v-if="!loading.jobPortraits && jobPortraitOptions.length === 0">暂无岗位画像，不影响生成学生画像。</small>
            </label>

            <button class="primary-btn full" :disabled="loading.resumeSubmit" @click="submitResumeProfile">
              <span class="material-symbols-outlined">auto_awesome</span>
              {{ loading.resumeSubmit ? "解析中" : "生成学生画像" }}
            </button>
          </template>
        </section>

        <section class="panel history-panel">
          <header class="panel-head">
            <div>
              <h3>历史画像</h3>
              <p>{{ profileRecords.length }} 条记录</p>
            </div>
          </header>
          <div class="history-list">
            <button v-for="item in profileRecords" :key="item.id" :class="{ active: selectedProfile?.id === item.id }" @click="selectProfile(item.id)">
              <span class="history-id">#{{ item.id }}</span>
              <strong>{{ profileName(item) }}</strong>
              <em>{{ profileTargetRole(item) || "未绑定岗位" }}</em>
              <small>{{ formatSourceType(item.source_type) }} · 完整度 {{ profileCompleteness(item) }}% · {{ formatDate(item.created_at) }}</small>
            </button>
            <p v-if="profileRecords.length === 0" class="empty-note">暂无历史画像。</p>
          </div>
        </section>
      </aside>

      <main class="profile-canvas">
        <template v-if="selectedProfile">
          <section class="profile-hero panel">
            <div class="avatar-mark">{{ profileName(selectedProfile).slice(0, 1) }}</div>
            <div class="hero-main">
              <p>{{ formatSourceType(selectedProfile.source_type) }} · #{{ selectedProfile.id }}</p>
              <h3>{{ profileName(selectedProfile) }}</h3>
              <span>{{ selectedProfile.education.school || "学校未填写" }} · {{ selectedProfile.education.major || "专业未填写" }} · {{ selectedProfile.education.graduation_year || "毕业年份未填" }}</span>
            </div>
            <strong class="target-badge" :class="{ muted: !profileTargetRole(selectedProfile) }">
              {{ profileTargetRole(selectedProfile) || "未绑定岗位" }}
            </strong>
          </section>

          <section class="metric-strip">
            <article class="metric-card"><span>完整度</span><strong>{{ profileCompleteness(selectedProfile) }}%</strong></article>
            <article class="metric-card"><span>竞争力</span><strong>{{ profileCompetitiveness(selectedProfile) }}%</strong></article>
            <article class="metric-card"><span>画像证据</span><strong>{{ usableEvidenceCount(selectedProfile) }}</strong></article>
            <article class="metric-card"><span>经历</span><strong>{{ selectedProfile.experiences.length }}</strong></article>
          </section>

          <section class="content-grid">
            <article class="panel section-card score-card">
              <header><h4>能力评分</h4><span>四维评估</span></header>
              <div class="meter-list">
                <div v-for="item in dimensionCards" :key="item.label">
                  <span>{{ item.label }}</span>
                  <i><b :style="{ width: `${item.value}%` }"></b></i>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </article>

            <article class="panel section-card">
              <header><h4>缺失项</h4><span>{{ selectedProfile.evaluation.missing_items.length || "完整" }}</span></header>
              <div class="tag-list warn">
                <span v-for="item in selectedProfile.evaluation.missing_items" :key="item">{{ formatMissingItem(item) }}</span>
                <span v-if="selectedProfile.evaluation.missing_items.length === 0">信息完整</span>
              </div>
            </article>

            <article class="panel section-card wide">
              <header><h4>技能</h4><span>{{ selectedProfile.skills.length }} 项</span></header>
              <div class="tag-list">
                <span v-for="skill in selectedProfile.skills" :key="skill.name">{{ skill.name }} · L{{ skill.level }}</span>
                <span v-if="selectedProfile.skills.length === 0" class="empty-chip">暂无技能</span>
              </div>
            </article>

            <article class="panel section-card">
              <header><h4>经历</h4><span>项目 {{ profileExperienceCount(selectedProfile, "project") }} · 实习 {{ profileExperienceCount(selectedProfile, "internship") }} · 竞赛 {{ profileExperienceCount(selectedProfile, "competition") }}</span></header>
              <div class="experience-list">
                <article v-for="item in selectedProfile.experiences" :key="`${item.kind}-${item.title}`">
                  <span>{{ formatExperienceKind(item.kind) }}</span>
                  <h5>{{ item.title }}</h5>
                  <p>{{ [...item.responsibilities, ...item.outcomes].slice(0, 2).join("；") || "暂无职责和成果描述" }}</p>
                </article>
                <p v-if="selectedProfile.experiences.length === 0" class="empty-note">暂无结构化经历。</p>
              </div>
            </article>

            <article class="panel section-card">
              <header><h4>证书</h4><span>{{ profileCertificateNames(selectedProfile).length }} 项</span></header>
              <div class="tag-list certificates">
                <span v-for="name in profileCertificateNames(selectedProfile)" :key="name">{{ name }}</span>
                <span v-if="profileCertificateNames(selectedProfile).length === 0" class="empty-chip">暂无证书</span>
              </div>
            </article>

            <article class="panel section-card wide">
              <header><h4>画像证据</h4><span>展示可用于画像的证据</span></header>
              <ul class="evidence-list">
                <li v-for="evidence in visibleEvidences(selectedProfile)" :key="evidence.id || evidence.quote">
                  <strong>{{ formatEvidenceField(evidence.field_path) }}</strong>
                  <span>{{ evidence.quote }}</span>
                </li>
              </ul>
              <p v-if="visibleEvidences(selectedProfile).length === 0" class="empty-note">暂无可展示证据。</p>
              <p v-if="hiddenEvidenceCount(selectedProfile) > 0" class="privacy-note">
                已隐藏 {{ hiddenEvidenceCount(selectedProfile) }} 条联系方式或非画像字段证据。
              </p>
            </article>

            <article class="panel section-card wide">
              <header><h4>画像摘要</h4><span>系统生成</span></header>
              <p class="summary-text">{{ selectedProfile.summary }}</p>
            </article>
          </section>
        </template>
        <section v-else class="panel empty-detail">
          <span class="material-symbols-outlined">description</span>
          <h3>暂无学生画像</h3>
          <p>上传简历或用表单创建第一条结构化画像。</p>
        </section>
      </main>
    </section>
  </section>
</template>

<style scoped>
.profile-workbench {
  --profile-surface: rgba(255, 255, 255, 0.78);
  --profile-surface-strong: rgba(255, 255, 255, 0.92);
  --profile-border: rgba(137, 158, 190, 0.32);
  --profile-text: #11233f;
  --profile-muted: #61708a;
  --profile-primary: #2563eb;
  --profile-primary-strong: #1d4ed8;
  --profile-primary-soft: rgba(37, 99, 235, 0.1);
  --profile-success-soft: rgba(5, 150, 105, 0.1);
  --profile-warning-soft: rgba(217, 119, 6, 0.12);
  --profile-radius: 18px;
  --profile-shadow: 0 18px 42px rgba(39, 63, 105, 0.1);
  display: grid;
  gap: 16px;
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
  color: var(--profile-text);
}

.page-titlebar,
.panel {
  border: 1px solid var(--profile-border);
  background: var(--profile-surface);
  border-radius: var(--profile-radius);
  box-shadow: var(--profile-shadow);
  backdrop-filter: blur(18px);
}

.page-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 22px 24px;
}

.title-copy {
  display: grid;
  gap: 4px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  color: var(--profile-primary);
  text-transform: uppercase;
  letter-spacing: 0;
}

.page-titlebar h2,
.page-titlebar p {
  margin: 0;
}

.page-titlebar h2 {
  font-size: 28px;
  line-height: 1.2;
}

.page-titlebar p {
  color: var(--profile-muted);
  line-height: 1.6;
}

.title-actions,
.segmented {
  display: flex;
  gap: 8px;
  align-items: center;
}

.segmented {
  padding: 4px;
  border: 1px solid rgba(137, 158, 190, 0.26);
  background: rgba(241, 245, 249, 0.76);
  border-radius: 12px;
}

.segmented button,
.ghost-btn,
.primary-btn {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  transition:
    background 160ms ease,
    color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.segmented button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 9px 12px;
  background: transparent;
  color: #53627a;
}

.segmented button.active,
.primary-btn {
  background: var(--profile-primary);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.2);
}

.ghost-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  background: rgba(255, 255, 255, 0.68);
  color: var(--profile-primary);
}

.primary-btn {
  display: inline-flex;
  justify-content: center;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
}

.segmented button:focus-visible,
.ghost-btn:focus-visible,
.primary-btn:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
.history-list button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.22);
  outline-offset: 2px;
}

.full {
  width: 100%;
}

.notice {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
}

.notice.error {
  background: rgba(255, 241, 242, 0.92);
  color: #be123c;
}

.notice.success {
  background: rgba(236, 253, 245, 0.92);
  color: #047857;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(340px, 390px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.side-rail,
.profile-canvas {
  display: grid;
  gap: 16px;
}

.panel {
  padding: 18px;
}

.panel-head,
.section-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.panel-head h3,
.section-card h4 {
  margin: 0;
  font-size: 16px;
}

.panel-head span,
.section-card header span,
.panel-head p {
  margin: 0;
  color: var(--profile-muted);
  font-size: 13px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

label,
.field {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  color: #26344d;
  font-size: 13px;
  font-weight: 700;
}

.field small,
.upload-box small {
  color: var(--profile-muted);
  font-weight: 600;
  line-height: 1.5;
}

input,
select,
textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  border: 1px solid rgba(137, 158, 190, 0.46);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--profile-text);
  background: rgba(255, 255, 255, 0.86);
  font: inherit;
}

textarea {
  resize: vertical;
  line-height: 1.6;
}

.rating-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin-top: 12px;
}

.rating-grid label {
  grid-template-columns: 42px 1fr 22px;
  align-items: center;
  min-height: 44px;
  margin-top: 0;
  padding: 8px 10px;
  border: 1px solid rgba(137, 158, 190, 0.22);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.68);
}

.upload-box {
  min-height: 176px;
  place-items: center;
  text-align: center;
  border: 1.5px dashed rgba(37, 99, 235, 0.32);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.86), rgba(255, 255, 255, 0.72));
  cursor: pointer;
}

.upload-box input {
  display: none;
}

.upload-box .material-symbols-outlined {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: var(--profile-primary-soft);
  color: var(--profile-primary);
  font-size: 34px;
}

.profile-hero {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  background: var(--profile-surface-strong);
}

.avatar-mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--profile-primary), #0f9f8f);
  color: #ffffff;
  font-size: 24px;
  font-weight: 800;
}

.hero-main {
  min-width: 0;
}

.hero-main p,
.hero-main h3,
.hero-main span {
  margin: 0;
}

.hero-main p,
.hero-main span {
  color: var(--profile-muted);
  font-size: 13px;
  line-height: 1.6;
}

.hero-main h3 {
  font-size: 24px;
  line-height: 1.25;
}

.target-badge {
  max-width: 240px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--profile-primary-soft);
  color: var(--profile-primary);
  overflow-wrap: anywhere;
}

.target-badge.muted {
  border: 1px solid rgba(137, 158, 190, 0.34);
  background: rgba(248, 250, 252, 0.82);
  color: var(--profile-muted);
  font-weight: 700;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.metric-card {
  padding: 14px;
  border: 1px solid var(--profile-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 24px rgba(39, 63, 105, 0.06);
}

.metric-card span {
  display: block;
  color: var(--profile-muted);
  font-size: 12px;
  font-weight: 700;
}

.metric-card strong {
  font-size: 24px;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.section-card {
  min-width: 0;
}

.section-card.wide {
  grid-column: 1 / -1;
}

.meter-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.meter-list div {
  display: grid;
  grid-template-columns: 86px minmax(120px, 1fr) 42px;
  align-items: center;
  gap: 10px;
}

.meter-list i {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
}

.meter-list b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--profile-primary), #0f9f8f);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.tag-list span {
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--profile-primary-soft);
  color: var(--profile-primary-strong);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.tag-list.certificates span {
  background: var(--profile-success-soft);
  color: #047857;
}

.tag-list.warn span {
  background: var(--profile-warning-soft);
  color: #c2410c;
}

.experience-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.experience-list article {
  padding: 12px;
  border: 1px solid rgba(137, 158, 190, 0.24);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.62);
}

.experience-list h5,
.experience-list p {
  margin: 4px 0 0;
  line-height: 1.6;
}

.experience-list article > span {
  color: var(--profile-primary);
  font-size: 12px;
  font-weight: 800;
}

.evidence-list {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 12px 0 0;
  list-style: none;
}

.evidence-list li {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(137, 158, 190, 0.2);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.62);
  line-height: 1.6;
}

.evidence-list strong {
  color: var(--profile-primary);
  font-size: 12px;
}

.privacy-note {
  margin: 10px 0 0;
  color: var(--profile-muted);
  font-size: 12px;
}

.summary-text,
.empty-note,
.empty-detail p {
  color: var(--profile-muted);
  line-height: 1.7;
}

.empty-detail {
  display: grid;
  place-items: center;
  min-height: 420px;
  text-align: center;
}

.empty-detail .material-symbols-outlined {
  color: #94a3b8;
  font-size: 48px;
}

.history-list {
  display: grid;
  gap: 8px;
  max-height: 420px;
  overflow: auto;
}

.history-list button {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 2px 10px;
  border: 1px solid rgba(137, 158, 190, 0.24);
  border-radius: 14px;
  padding: 11px;
  background: rgba(255, 255, 255, 0.62);
  text-align: left;
  cursor: pointer;
}

.history-list button.active {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(239, 246, 255, 0.8);
}

.history-id {
  grid-row: span 3;
  color: var(--profile-primary);
  font-weight: 800;
}

.history-list strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.history-list em,
.history-list small {
  color: var(--profile-muted);
  font-style: normal;
  line-height: 1.45;
}

.material-symbols-outlined {
  font-size: 20px;
  line-height: 1;
}

button:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

@media (max-width: 1180px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .side-rail {
    grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
    align-items: start;
  }
}

@media (max-width: 820px) {
  .page-titlebar,
  .title-actions,
  .side-rail,
  .content-grid,
  .metric-strip,
  .field-grid,
  .field-row {
    grid-template-columns: 1fr;
  }

  .page-titlebar,
  .title-actions {
    display: grid;
  }

  .segmented {
    width: 100%;
  }

  .segmented button,
  .ghost-btn {
    justify-content: center;
    width: 100%;
  }

  .profile-hero {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .target-badge {
    grid-column: 1 / -1;
    width: fit-content;
  }

  .rating-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .profile-workbench {
    gap: 12px;
  }

  .page-titlebar,
  .panel {
    padding: 14px;
    border-radius: 14px;
  }

  .page-titlebar h2 {
    font-size: 24px;
  }

  .meter-list div {
    grid-template-columns: 76px minmax(80px, 1fr) 36px;
  }

  .avatar-mark {
    width: 56px;
    height: 56px;
  }
}
</style>
