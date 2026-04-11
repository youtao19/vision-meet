import type {
  CreateStudentProfileFromResumeRequest,
  CreateStudentProfileRequest,
  DimensionScores,
  ListStudentProfilesResponse,
  StudentProfileExperience,
  StudentProfileRecord,
  StudentProfileSelfAssessment,
} from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { buildSha256Digest } from "../../shared/utils/match-fingerprint.js";
import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { ProfileRepository, StudentProfileCreateInput } from "./profile.repository.js";

/**
 * 文件作用：承载学生画像领域核心业务逻辑。
 * 依赖关系：仅依赖 ProfileRepository 抽象，不接触具体存储实现。
 */
export interface ProfileService {
  listProfiles(): Promise<ListStudentProfilesResponse>;
  createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord>;
  createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord>;
}

export type ResumeProfileCreatedHook = (params: {
  profile: StudentProfileRecord;
  resumeInput: CreateStudentProfileFromResumeRequest;
}) => Promise<void> | void;

const SCORE_WEIGHTS = {
  base_requirements: 0.2,
  professional_skills: 0.45,
  professional_quality: 0.2,
  development_potential: 0.15,
};

const DEFAULT_SELF_ASSESSMENT: StudentProfileSelfAssessment = {
  communication: 3,
  learning: 3,
  stress_tolerance: 3,
  innovation: 3,
};

const EMPTY_EXPERIENCE: StudentProfileExperience = {
  internship_count: 0,
  project_count: 0,
  competition_count: 0,
};

const RESUME_SKILL_KEYWORDS = [
  "typescript",
  "vue",
  "react",
  "node",
  "express",
  "python",
  "java",
  "sql",
  "linux",
  "docker",
  "沟通",
  "协作",
  "测试",
  "算法",
  "数据分析",
  "机器学习",
];

const RESUME_CERTIFICATE_KEYWORDS = [
  "英语六级",
  "英语四级",
  "pmp",
  "软考",
  "教师资格证",
  "计算机二级",
];

const TARGET_ROLE_PLACEHOLDER_SET = new Set([
  "待定岗位",
  "待定职位",
  "待定",
  "未定岗位",
  "未定职位",
  "未知岗位",
  "未知职位",
  "目标岗位",
  "目标职位",
  "意向岗位",
  "意向职位",
]);

const RESUME_ROLE_INFERENCE_RULES = [
  {
    targetRole: "前端开发工程师",
    keywords: ["vue", "react", "javascript", "typescript", "html", "css", "前端"],
  },
  {
    targetRole: "后端开发工程师",
    keywords: ["node", "express", "java", "spring", "mysql", "sql", "后端", "服务端"],
  },
  {
    targetRole: "数据分析师",
    keywords: ["python", "sql", "数据分析", "excel", "bi", "pandas", "可视化"],
  },
  {
    targetRole: "测试工程师",
    keywords: ["测试", "test", "pytest", "jmeter", "接口测试", "自动化测试"],
  },
  {
    targetRole: "产品经理",
    keywords: ["产品", "需求分析", "prd", "axure", "用户研究", "原型"],
  },
];

const RESUME_NAME_BLOCKLIST = /(电话|手机|邮箱|教育背景|项目经历|工作经历|求职意向|目标岗位|专业技能|个人优势|联系方式|个人简历|简历|resume|cv|候选人|工程师|开发|实习|校招|春招|秋招|软件|Java|后端|前端|测试|产品|数据)/i;

type MissingItemRule = {
  key: string;
  isMissing: boolean;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelToScore(level: number): number {
  return level * 20;
}

function uniqueNonEmpty(items: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  items.forEach((item) => {
    const normalized = item.trim();
    if (!normalized) {
      return;
    }
    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) {
      return;
    }
    seen.add(lowered);
    result.push(normalized);
  });
  return result;
}

function normalizeOptionalText(value?: string): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function isPlaceholderTargetRole(value?: string | null): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.trim().replace(/\s+/g, "");
  return !normalized || TARGET_ROLE_PLACEHOLDER_SET.has(normalized);
}

function cleanResumeFieldCandidate(value: string): string | null {
  const normalized = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }

  const primarySegment = normalized
    .split(/\s*(?:\||｜|\/|／|,|，|;|；)\s*/)[0]
    ?.replace(/\s*(?:意向城市|目标城市|工作地点).*/i, "")
    .replace(/\s*[\(（【[].*$/, "")
    .trim();

  return primarySegment || null;
}

/**
 * 从简历里提取“标签: 值”形式的字段。
 * 注意：这里按行起始匹配，避免把 PDF/Word 原始二进制里的字体名、资源名误识别为姓名或岗位。
 */
function extractResumeLabeledField(content: string, labels: string[]): string | null {
  const pattern = new RegExp(
    `^(?:[-*•#>\\d.()\\s]*)?(?:${labels.join("|")})\\s*[:：]\\s*(.+)$`,
    "i",
  );
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = cleanResumeFieldCandidate(match[1]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function normalizeExperience(input?: Partial<StudentProfileExperience>): StudentProfileExperience {
  return {
    internship_count: input?.internship_count ?? EMPTY_EXPERIENCE.internship_count,
    project_count: input?.project_count ?? EMPTY_EXPERIENCE.project_count,
    competition_count: input?.competition_count ?? EMPTY_EXPERIENCE.competition_count,
  };
}

function normalizeSelfAssessment(
  input?: Partial<StudentProfileSelfAssessment>,
): StudentProfileSelfAssessment {
  return {
    communication: input?.communication ?? DEFAULT_SELF_ASSESSMENT.communication,
    learning: input?.learning ?? DEFAULT_SELF_ASSESSMENT.learning,
    stress_tolerance: input?.stress_tolerance ?? DEFAULT_SELF_ASSESSMENT.stress_tolerance,
    innovation: input?.innovation ?? DEFAULT_SELF_ASSESSMENT.innovation,
  };
}

/**
 * 计算学生画像四维得分。
 * 注意点：评分必须保持确定性，不能引入随机项，否则会破坏后续匹配可复现性。
 */
function calculateDimensionScores(params: {
  skills: string[];
  certificates: string[];
  experience: StudentProfileExperience;
  selfAssessment: StudentProfileSelfAssessment;
  educationLevel: string | null;
  graduationYear: number | null;
  personalSummary: string | null;
}): DimensionScores {
  const baseRequirements = clampScore(
    35 +
      Math.min(params.certificates.length * 12, 30) +
      Math.min(params.experience.internship_count * 10, 30) +
      (params.educationLevel ? 5 : 0) +
      (params.graduationYear ? 5 : 0),
  );

  const professionalSkills = clampScore(
    30 +
      Math.min(params.skills.length * 9, 45) +
      Math.min(params.experience.project_count * 8, 16) +
      Math.min(params.certificates.length * 3, 9),
  );

  const professionalQuality = clampScore(
    ((levelToScore(params.selfAssessment.communication) +
      levelToScore(params.selfAssessment.stress_tolerance)) /
      2) *
      0.85 +
      (params.personalSummary ? 15 : 0),
  );

  const developmentPotential = clampScore(
    ((levelToScore(params.selfAssessment.learning) +
      levelToScore(params.selfAssessment.innovation)) /
      2) *
      0.75 +
      Math.min(params.experience.competition_count * 8, 16) +
      Math.min(params.experience.project_count * 4, 8),
  );

  return {
    base_requirements: baseRequirements,
    professional_skills: professionalSkills,
    professional_quality: professionalQuality,
    development_potential: developmentPotential,
  };
}

function calculateCompleteness(input: CreateStudentProfileRequest): {
  completenessScore: number;
  missingItems: string[];
} {
  const checks: MissingItemRule[] = [
    { key: "education_level", isMissing: !input.education_level?.trim() },
    { key: "major", isMissing: !input.major?.trim() },
    { key: "graduation_year", isMissing: input.graduation_year === undefined },
    { key: "certificates", isMissing: !input.certificates || input.certificates.length === 0 },
    {
      key: "experience.internship_count",
      isMissing: !input.experience || input.experience.internship_count === undefined,
    },
    {
      key: "experience.project_count",
      isMissing: !input.experience || input.experience.project_count === undefined,
    },
    {
      key: "experience.competition_count",
      isMissing: !input.experience || input.experience.competition_count === undefined,
    },
    {
      key: "self_assessment.communication",
      isMissing: !input.self_assessment || input.self_assessment.communication === undefined,
    },
    {
      key: "self_assessment.learning",
      isMissing: !input.self_assessment || input.self_assessment.learning === undefined,
    },
    {
      key: "self_assessment.stress_tolerance",
      isMissing: !input.self_assessment || input.self_assessment.stress_tolerance === undefined,
    },
    {
      key: "self_assessment.innovation",
      isMissing: !input.self_assessment || input.self_assessment.innovation === undefined,
    },
    { key: "personal_summary", isMissing: !input.personal_summary?.trim() },
  ];

  const missingItems = checks.filter((check) => check.isMissing).map((check) => check.key);
  const completenessScore = clampScore(
    ((checks.length - missingItems.length) / checks.length) * 100,
  );
  return { completenessScore, missingItems };
}

function calculateCompetitiveness(dimensionScores: DimensionScores): number {
  return clampScore(
    dimensionScores.base_requirements * SCORE_WEIGHTS.base_requirements +
      dimensionScores.professional_skills * SCORE_WEIGHTS.professional_skills +
      dimensionScores.professional_quality * SCORE_WEIGHTS.professional_quality +
      dimensionScores.development_potential * SCORE_WEIGHTS.development_potential,
  );
}

/**
 * 判断候选文本是否像“真实姓名”。
 * 注意点：这里显式排除简历栏目、岗位词与“简历/resume”等噪声词，避免把标题或文件名中的岗位描述误判为姓名。
 */
function isLikelyResumeNameCandidate(value: string): boolean {
  if (!value || RESUME_NAME_BLOCKLIST.test(value)) {
    return false;
  }

  return (
    /^[\u4e00-\u9fa5·]{2,5}$/.test(value) ||
    /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/.test(value)
  );
}

/**
 * 从单行标题或文件名片段中提取姓名。
 * 参数：
 * - rawText: 原始候选文本，可能同时包含姓名、岗位、简历字样等混合信息。
 * 返回：
 * - 若命中较可信的中文/英文姓名则返回清洗后的姓名，否则返回 null。
 * 注意点：优先尝试整段命中，再拆分常见分隔符，兼容“张三 | 后端开发工程师”“王小明-简历”等标题格式。
 */
function extractResumeNameFromLooseText(rawText: string): string | null {
  const cleaned = rawText
    .replace(/^姓名\s*[:：]?\s*/i, "")
    .replace(/^name\s*[:：]?\s*/i, "")
    .replace(/\.[A-Za-z0-9]+$/g, "")
    // 部分 PDF 会把姓名渲染成 “[ 吴友桃 ] | 全栈开发工程师”，这里只去掉括号外壳，不能连内容一起删除。
    .replace(/[【\[]/g, " ")
    .replace(/[】\]]/g, " ")
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length > 40 || /[@:：/\\]/.test(cleaned)) {
    return null;
  }

  if (isLikelyResumeNameCandidate(cleaned)) {
    return cleaned;
  }

  const leadingChineseName = cleaned.match(/^([\u4e00-\u9fa5·]{2,5})(?:\s+|[|｜,，;；·•\-_].*)$/);
  if (leadingChineseName?.[1] && isLikelyResumeNameCandidate(leadingChineseName[1])) {
    return leadingChineseName[1];
  }

  const leadingEnglishName = cleaned.match(
    /^([A-Za-z]+(?:\s+[A-Za-z]+){0,2})(?:\s*[-|｜,，;；·•_].*)$/,
  );
  if (leadingEnglishName?.[1] && isLikelyResumeNameCandidate(leadingEnglishName[1])) {
    return leadingEnglishName[1];
  }

  const segments = cleaned
    .split(/\s*(?:\||｜|,|，|;|；|·|•|-|—|_)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (isLikelyResumeNameCandidate(segment)) {
      return segment;
    }
  }

  return null;
}

/**
 * 从文件名中兜底提取姓名。
 * 参数：
 * - fileName: 上传简历时保留下来的原始文件名。
 * 返回：
 * - 当文件名中存在较明确姓名时返回姓名，否则返回 null。
 * 注意点：很多学生简历会命名为“张三-后端开发工程师-简历.pdf”，正文即使解析不完整，也可以先借助文件名避免落成匿名候选人。
 */
function extractResumeNameFromFileName(fileName?: string): string | null {
  if (!fileName) {
    return null;
  }

  const normalizedName = fileName
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/(?:个人)?简历/gi, " ")
    .replace(/\b(?:resume|cv)\b/gi, " ")
    .replace(/最新版|最终版|终版|更新版|附件|副本/g, " ")
    .replace(/\d{4}[._-]?\d{1,2}[._-]?\d{1,2}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedName) {
    return null;
  }

  return extractResumeNameFromLooseText(normalizedName);
}

/**
 * 从简历文本中提取候选人姓名。
 * 参数：
 * - content: 已转纯文本并完成基础清洗的简历正文。
 * - fileName: 原始上传文件名，用于正文解析失败时做兜底。
 * 返回：
 * - 提取成功返回姓名，否则返回 null。
 * 注意点：提取顺序为“标签字段 -> 顶部标题行 -> 文件名”，尽量优先使用正文中的显式信息，最后才退回文件名猜测。
 */
function extractResumeName(content: string, fileName?: string): string | null {
  const labeledName = extractResumeLabeledField(content, ["姓名", "Name"]);
  if (labeledName) {
    return labeledName;
  }

  const topLines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of topLines) {
    if (
      line.length > 24 ||
      /[@:：/\\]/.test(line) ||
      /(电话|手机|邮箱|教育背景|项目经历|工作经历|求职意向|目标岗位|专业技能|个人优势)/i.test(line)
    ) {
      continue;
    }

    const candidate = extractResumeNameFromLooseText(line);
    if (candidate) {
      return candidate;
    }
  }

  return extractResumeNameFromFileName(fileName);
}

function extractResumeMajor(content: string): string | null {
  return extractResumeLabeledField(content, ["专业", "Major"]);
}

function extractResumeGraduationYear(content: string): number | undefined {
  const match = content.match(/(20\d{2})\s*(?:届|毕业|graduation)?/i);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  return parsed >= 2000 && parsed <= 2100 ? parsed : undefined;
}

function extractResumeSkills(content: string): string[] {
  const lowered = content.toLowerCase();
  const matched = RESUME_SKILL_KEYWORDS.filter((keyword) =>
    lowered.includes(keyword.toLowerCase()),
  );
  return uniqueNonEmpty(matched);
}

function extractResumeCertificates(content: string): string[] {
  const lowered = content.toLowerCase();
  const matched = RESUME_CERTIFICATE_KEYWORDS.filter((keyword) =>
    lowered.includes(keyword.toLowerCase()),
  );
  return uniqueNonEmpty(matched);
}

function countRegexMatches(content: string, regex: RegExp): number {
  const matched = content.match(regex);
  return matched ? matched.length : 0;
}

function extractResumeTargetRole(content: string): string | null {
  return extractResumeLabeledField(content, [
    "目标岗位",
    "目标职位",
    "意向岗位",
    "意向职位",
    "岗位意向",
    "求职意向",
    "求职方向",
    "应聘岗位",
    "应聘职位",
    "Target Position",
    "Target Role",
  ]);
}

function inferTargetRoleFromResume(content: string, skills: string[]): string | null {
  const searchableText = `${content}\n${skills.join("\n")}`.toLowerCase();

  let bestMatch: { targetRole: string; score: number } | null = null;
  for (const rule of RESUME_ROLE_INFERENCE_RULES) {
    const score = rule.keywords.reduce((total, keyword) => {
      return searchableText.includes(keyword.toLowerCase()) ? total + 1 : total;
    }, 0);

    if (score <= 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        targetRole: rule.targetRole,
        score,
      };
    }
  }

  return bestMatch?.targetRole ?? null;
}

async function resolveResumeTargetRole(params: {
  resumeInput: CreateStudentProfileFromResumeRequest;
  normalizedContent: string;
  skills: string[];
  jobsRepository?: JobsRepository;
}): Promise<string> {
  const candidates = uniqueNonEmpty(
    [
      params.resumeInput.target_role,
      extractResumeTargetRole(params.normalizedContent) ?? "",
      inferTargetRoleFromResume(params.normalizedContent, params.skills) ?? "",
    ].filter((item) => !isPlaceholderTargetRole(item)),
  );

  for (const candidate of candidates) {
    if (!params.jobsRepository) {
      return candidate;
    }

    const matchedJob = await params.jobsRepository.findBestJobByTargetRole(candidate);
    if (matchedJob) {
      return matchedJob.title;
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  return "待定岗位";
}

/**
 * 将简历文本映射为标准画像输入。
 * 关键点：strict 模式下若无法识别关键技能会直接报 422，避免生成误导性画像。
 */
async function buildProfileInputFromResume(
  resumeInput: CreateStudentProfileFromResumeRequest,
  jobsRepository?: JobsRepository,
): Promise<CreateStudentProfileRequest> {
  const normalizedContent = resumeInput.file_content
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r\n/g, "\n");
  const skills = extractResumeSkills(normalizedContent);

  if (resumeInput.parse_mode === "strict" && skills.length === 0) {
    throw new HttpError(422, "RESUME_PARSE_FAILED", "严格模式下未识别到可用技能");
  }

  const certificates = extractResumeCertificates(normalizedContent);
  const projectCount = Math.max(1, countRegexMatches(normalizedContent, /(项目|project)/gi));
  const internshipCount = countRegexMatches(normalizedContent, /(实习|intern)/gi);
  const competitionCount = countRegexMatches(normalizedContent, /(竞赛|比赛|competition)/gi);

  const autoName = extractResumeName(normalizedContent, resumeInput.file_name);
  const autoMajor = extractResumeMajor(normalizedContent);
  const autoGraduationYear = extractResumeGraduationYear(normalizedContent);
  const targetRole = await resolveResumeTargetRole({
    resumeInput,
    normalizedContent,
    skills,
    jobsRepository,
  });

  const topLines = normalizedContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("；");

  return {
    name: (resumeInput.name || autoName || "匿名候选人").trim(),
    target_role: targetRole,
    major: autoMajor ?? undefined,
    graduation_year: autoGraduationYear,
    skills: skills.length > 0 ? skills : ["学习能力"],
    certificates,
    experience: {
      internship_count: internshipCount,
      project_count: projectCount,
      competition_count: competitionCount,
    },
    self_assessment: {
      communication: 3,
      learning: 4,
      stress_tolerance: 3,
      innovation: 3,
    },
    personal_summary: topLines || undefined,
  };
}

/**
 * 持久化学生画像。
 * 参数：
 * - input: 标准画像输入。
 * - sourceType/sourceDigest: 数据来源标记与可追踪摘要。
 */
async function createProfileRecord(
  repository: ProfileRepository,
  input: CreateStudentProfileRequest,
  sourceType: "manual" | "resume",
  sourceDigest: string,
): Promise<StudentProfileRecord> {
  const skills = uniqueNonEmpty(input.skills);
  const certificates = uniqueNonEmpty(input.certificates || []);
  const experience = normalizeExperience(input.experience);
  const selfAssessment = normalizeSelfAssessment(input.self_assessment);
  const educationLevel = normalizeOptionalText(input.education_level);
  const major = normalizeOptionalText(input.major);
  const personalSummary = normalizeOptionalText(input.personal_summary);
  const graduationYear = input.graduation_year ?? null;

  const dimensionScores = calculateDimensionScores({
    skills,
    certificates,
    experience,
    selfAssessment,
    educationLevel,
    graduationYear,
    personalSummary,
  });
  const { completenessScore, missingItems } = calculateCompleteness(input);
  const competitivenessScore = calculateCompetitiveness(dimensionScores);

  const recordInput: StudentProfileCreateInput = {
    source_type: sourceType,
    source_digest: sourceDigest,
    name: input.name.trim(),
    target_role: input.target_role.trim(),
    education_level: educationLevel,
    major,
    graduation_year: graduationYear,
    skills,
    certificates,
    experience,
    self_assessment: selfAssessment,
    dimension_scores: dimensionScores,
    completeness_score: completenessScore,
    competitiveness_score: competitivenessScore,
    missing_items: missingItems,
    personal_summary: personalSummary,
    summary: `目标岗位【${input.target_role}】画像已生成：完整度 ${completenessScore}，竞争力 ${competitivenessScore}。`,
  };

  return repository.createStudentProfile(recordInput);
}

export function createProfileService(
  repository: ProfileRepository,
  options: {
    jobsRepository?: JobsRepository;
    onResumeProfileCreated?: ResumeProfileCreatedHook;
  } = {},
): ProfileService {
  async function createProfile(input: CreateStudentProfileRequest): Promise<StudentProfileRecord> {
    const sourceDigest = buildSha256Digest({
      source_type: "manual",
      payload: input,
    });

    return createProfileRecord(repository, input, "manual", sourceDigest);
  }

  async function createProfileFromResume(
    input: CreateStudentProfileFromResumeRequest,
  ): Promise<StudentProfileRecord> {
    const digest = buildSha256Digest({
      source_type: "resume",
      file_name: input.file_name,
      file_content: input.file_content,
      target_role: input.target_role,
      name: input.name,
      parse_mode: input.parse_mode ?? "tolerant",
    });
    const mappedInput = await buildProfileInputFromResume(input, options.jobsRepository);
    const profile = await createProfileRecord(repository, mappedInput, "resume", digest);
    if (options.onResumeProfileCreated) {
      await options.onResumeProfileCreated({
        profile,
        resumeInput: input,
      });
    }
    return profile;
  }

  return {
    listProfiles: async () => repository.listStudentProfiles(),
    createProfile,
    createProfileFromResume,
  };
}
