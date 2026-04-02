/**
 * 文件作用：定义前后端共享的数据契约类型。
 * 职责边界：本文件只负责类型声明，不承载业务逻辑；接口字段变更必须先修改这里。
 */

export type DimensionKey =
  | "base_requirements"
  | "professional_skills"
  | "professional_quality"
  | "development_potential";

export type DimensionScores = {
  base_requirements: number;
  professional_skills: number;
  professional_quality: number;
  development_potential: number;
};

export type StructuredApiError = {
  code: string;
  message: string;
  detail?: unknown;
  trace_id?: string;
};

export type JobRecord = {
  id: number;
  source_row_id: string | null;
  title: string;
  location: string | null;
  salary_range: string | null;
  company_name: string | null;
  industry: string | null;
  company_size: string | null;
  company_type: string | null;
  job_code: string | null;
  job_description: string | null;
  company_intro: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
};

export type JobProfileRecord = {
  id: number;
  job_id: number;
  profile_version: number;
  hard_skills: string[];
  certificates: string[];
  soft_skills: string[];
  skill_weights: Record<string, number>;
  summary: string;
  confidence: number;
  created_at: string;
};

export type JobsListParams = {
  keyword?: string;
  industry?: string;
  offset: number;
  limit: number;
};

export type JobsListResponse = {
  total: number;
  items: JobRecord[];
};

export type JobImportResponse = {
  imported: number;
  skipped: number;
  message: string;
};

export type JobProfileGenerateRequest = {
  job_id: number;
  force_regenerate: boolean;
};

export type JobProfileGenerateResponse = JobProfileRecord & {
  cached: boolean;
};

export type StudentProfileExperience = {
  internship_count: number;
  project_count: number;
  competition_count: number;
};

export type StudentProfileSelfAssessment = {
  communication: number;
  learning: number;
  stress_tolerance: number;
  innovation: number;
};

export type StudentProfileRecord = {
  id: number;
  source_type: "manual" | "resume";
  source_digest: string;
  name: string;
  target_role: string;
  education_level: string | null;
  major: string | null;
  graduation_year: number | null;
  skills: string[];
  certificates: string[];
  experience: StudentProfileExperience;
  self_assessment: StudentProfileSelfAssessment;
  dimension_scores: DimensionScores;
  completeness_score: number;
  competitiveness_score: number;
  missing_items: string[];
  personal_summary: string | null;
  summary: string;
  created_at: string;
};

export type CreateStudentProfileRequest = {
  name: string;
  target_role: string;
  education_level?: string;
  major?: string;
  graduation_year?: number;
  skills: string[];
  certificates?: string[];
  experience?: Partial<StudentProfileExperience>;
  self_assessment?: Partial<StudentProfileSelfAssessment>;
  personal_summary?: string;
};

export type CreateStudentProfileFromResumeRequest = {
  file_name: string;
  file_content: string;
  target_role: string;
  name?: string;
  parse_mode?: "strict" | "tolerant";
};

export type ListStudentProfilesResponse = {
  total: number;
  items: StudentProfileRecord[];
};

export type MatchGapItem = {
  dimension: DimensionKey;
  target_score: number;
  current_score: number;
  gap: number;
  evidence: string[];
};

export type MatchExplanationItem = {
  dimension: DimensionKey;
  reasoning: string;
  improvement_actions: string[];
};

export type CreateMatchRequest = {
  student_profile_id: number;
  job_id: number;
  force_recalculate?: boolean;
};

export type MatchResultSummary = {
  id: number;
  student_profile_id: number;
  job_id: number;
  job_profile_version: number;
  scoring_version: string;
  input_fingerprint: string;
  from_cache: boolean;
  dimension_scores: DimensionScores;
  total_score: number;
  created_at: string;
};

export type MatchResultDetail = MatchResultSummary & {
  gaps: MatchGapItem[];
  suggestions: string[];
  explanations: MatchExplanationItem[];
};

export type MatchListParams = {
  student_profile_id?: number;
  job_id?: number;
  offset: number;
  limit: number;
};

export type MatchResultListResponse = {
  total: number;
  items: MatchResultSummary[];
};

export type CareerReportSectionKey =
  | "overview"
  | "match_analysis"
  | "strengths"
  | "gaps_and_actions"
  | "short_term_plan"
  | "mid_term_plan";

export type CareerReportSection = {
  key: CareerReportSectionKey;
  title: string;
  content: string;
};

export type CareerReportSummary = {
  id: number;
  match_id: number;
  version: number;
  student_profile_id: number;
  job_id: number;
  total_score: number;
  created_at: string;
  updated_at: string;
};

export type CareerReportRecord = CareerReportSummary & {
  sections: CareerReportSection[];
};

export type CreateReportRequest = {
  match_id: number;
};

export type UpdateReportRequest = {
  sections: CareerReportSection[];
};

export type ReportListParams = {
  match_id: number;
};

export type ReportListResponse = {
  total: number;
  items: CareerReportSummary[];
};

export type CareerReportExportFormat = "pdf";

export type CareerReportExportRecord = {
  id: number;
  report_id: number;
  format: CareerReportExportFormat;
  file_name: string;
  file_size_bytes: number;
  created_at: string;
  download_path: string;
};

export type CreateReportExportRequest = {
  format: CareerReportExportFormat;
};

export type ReportExportListResponse = {
  total: number;
  items: CareerReportExportRecord[];
};

export type ApiErrorResponse = StructuredApiError;
