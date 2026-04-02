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

export type KnowledgeSourceKind = "job_dataset" | "resume_text" | "project_doc";

export type KnowledgeNamespace = "career_runtime" | "internal_project_docs";

export type KnowledgeIndexItem = {
  source_id?: string;
  source_path?: string;
  title?: string;
  text?: string;
  section_path?: string | null;
  job_id?: number | null;
  profile_id?: number | null;
};

export type KnowledgeDocumentRecord = {
  id: number;
  namespace: KnowledgeNamespace;
  source_kind: KnowledgeSourceKind;
  source_id: string;
  title: string;
  source_path: string | null;
  section_path: string | null;
  job_id: number | null;
  profile_id: number | null;
  content_digest: string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunkRecord = {
  id: number;
  document_id: number;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  created_at: string;
  updated_at: string;
};

export type KnowledgeIndexRequest = {
  namespace?: KnowledgeNamespace;
  source_kind: KnowledgeSourceKind;
  force_reindex?: boolean;
  items: KnowledgeIndexItem[];
};

export type KnowledgeIndexResponse = {
  namespace: KnowledgeNamespace;
  source_kind: KnowledgeSourceKind;
  indexed_documents: number;
  indexed_chunks: number;
  skipped_documents: number;
};

export type KnowledgeSearchRequest = {
  query: string;
  namespace?: KnowledgeNamespace;
  source_kinds?: KnowledgeSourceKind[];
  student_profile_id?: number;
  limit?: number;
};

export type KnowledgeSearchResultItem = {
  id: number;
  document_id: number;
  namespace: KnowledgeNamespace;
  source_kind: KnowledgeSourceKind;
  source_id: string;
  title: string;
  chunk_index: number;
  chunk_text: string;
  source_path: string | null;
  section_path: string | null;
  job_id: number | null;
  profile_id: number | null;
  keyword_score: number;
  vector_score: number;
  final_score: number;
};

export type KnowledgeSearchResponse = {
  total: number;
  items: KnowledgeSearchResultItem[];
};

export type KnowledgeEvaluationRequest = {
  namespace?: KnowledgeNamespace;
  top_k?: number;
};

export type KnowledgeEvaluationCaseResult = {
  query: string;
  expected_terms: string[];
  hit: boolean;
  reciprocal_rank: number;
  matched_chunk_ids: number[];
};

export type KnowledgeEvaluationResponse = {
  namespace: KnowledgeNamespace;
  top_k: number;
  recall_at_k: number;
  mrr: number;
  cases: KnowledgeEvaluationCaseResult[];
};

export type AgentWarningCode =
  | "EVIDENCE_INSUFFICIENT"
  | "KNOWLEDGE_SEARCH_FAILED"
  | "REPORT_GENERATION_FAILED"
  | "FINAL_SUMMARY_FALLBACK";

export type AgentTaskStatus = "success" | "partial_success" | "failed";

export type AgentDeliverable = "match_analysis" | "career_report";

export type AgentToolName =
  | "task_planning"
  | "context_lookup"
  | "knowledge_search"
  | "match_evaluation"
  | "report_generation"
  | "final_answer";

export type AgentStepTraceStatus = "success" | "warning" | "error" | "skipped";

export type AgentPlanStep = {
  id: string;
  tool: AgentToolName;
  title: string;
  purpose: string;
};

export type AgentStepTraceItem = {
  step_id: string;
  tool: AgentToolName;
  title: string;
  status: AgentStepTraceStatus;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  error_code?: string;
};

export type CreateAgentTaskRequest = {
  student_profile_id: number;
  job_id: number;
  objective?: string;
  deliverables?: AgentDeliverable[];
  force_recalculate?: boolean;
  top_k?: number;
};

export type AgentTaskResult = {
  summary: string;
  knowledge_hits: KnowledgeSearchResultItem[];
  match_result: MatchResultDetail | null;
  report: CareerReportRecord | null;
  warnings: AgentWarningCode[];
};

export type AgentTaskResponse = {
  task_id: number;
  trace_id: string;
  status: AgentTaskStatus;
  student_profile_id: number;
  job_id: number;
  objective: string;
  deliverables: AgentDeliverable[];
  model: string | null;
  planned_steps: AgentPlanStep[];
  step_trace: AgentStepTraceItem[];
  result: AgentTaskResult;
  created_at: string;
  finished_at: string;
};

/**
 * 文件作用：为旧命名保留兼容别名，避免前后端在本轮重构期间出现大面积断裂。
 * 注意：新代码应优先使用 Task / Step 语义，而不是 Analyze / ToolTrace 语义。
 */
export type AgentToolTraceStatus = AgentStepTraceStatus;
export type AgentToolTraceStep = AgentToolName;
export type AgentToolTraceItem = AgentStepTraceItem;
export type AgentChatRequest = CreateAgentTaskRequest;
export type AgentChatResponse = AgentTaskResponse;
export type AgentAnalyzeRequest = CreateAgentTaskRequest;
export type AgentAnalyzeResponse = AgentTaskResponse;

export type ApiErrorResponse = StructuredApiError;
