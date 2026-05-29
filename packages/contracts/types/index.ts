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

export type JobPortraitSubIndustry = {
  industry: string;
  description: string;
  representCompanies: string[];
  skills: string[];
  softSkills: string[];
  certificates: string[];
  innovationAbility: string;
  learningAbility: string;
  stressResistance: string;
  communicationAbility: string;
  internshipAbility: string;
  salaryLevel: string;
  overtimeLevel: string;
  industryFeatures: string[];
  recommendedProjects: string[];
};

export type JobPortraitDetail = {
  name: string;
  category: string;
  description: string;
  educationRequirements: string[];
  skills: string[];
  softSkills: string[];
  certificates: string[];
  innovationAbility: string;
  learningAbility: string;
  stressResistance: string;
  communicationAbility: string;
  internshipAbility: string;
  careerPath: string[];
  subIndustries: JobPortraitSubIndustry[];
};

export type ManualJobPortraitRecord = {
  id: number;
  job_name: string;
  category: string;
  comic_image_url?: string | null;
  comic_generated_at?: string | null;
  profile_detail: JobPortraitDetail;
  created_at: string;
  updated_at: string;
};

export type ManualJobPortraitListResponse = {
  total: number;
  items: ManualJobPortraitRecord[];
};

export type JobPortraitPictureBookContext = {
  category?: string;
  summary?: string;
  tech_stack?: string[];
  industry_context?: string;
  core_responsibilities?: string[];
  suitable_for?: string[];
  not_suitable_for?: string[];
};

export type GenerateJobPortraitPictureBookResponse = {
  job_name: string;
  comic_image_url: string;
};

export type PictureBookPage = {
  page_index: number;
  image_url: string;
  narration_text: string;
  audio_url: string;
  audio_duration_ms: number;
};

export type JobPictureBook = {
  job_name: string;
  title: string;
  pages: PictureBookPage[];
  total_pages: number;
};

export type GeneratePictureBookResponse = {
  job_name: string;
  pages: PictureBookPage[];
};

export type CareerGraphNodeRecord = {
  id: string;
  portrait_id: number;
  title: string;
  family: string;
  level: number;
  skills: string[];
  summary: string;
};

export type CareerGraphEdgeRecord = {
  id: string;
  source: string;
  target: string;
  relation_type: "promotion" | "transition" | "skill_migration";
  reason: string;
  required_skills: string[];
  gap_skills: string[];
  transition_cost: "low" | "medium" | "high";
  direction_label: string;
  score: number;
};

export type CareerGraphSnapshot = {
  graph_version: string;
  generated_at: string;
  nodes: CareerGraphNodeRecord[];
  edges: CareerGraphEdgeRecord[];
};

export type StudentProfileSelfAssessment = {
  communication: number;
  learning: number;
  stress_tolerance: number;
  innovation: number;
};

export type StudentProfileSourceType = "manual" | "resume";

export type StudentProfileEvidenceSource = "manual" | "resume_text" | "agent";

export type StudentProfileEvidence = {
  id?: string;
  source: StudentProfileEvidenceSource;
  field_path: string;
  quote: string;
  confidence: number;
};

export type StudentProfileBasicInfo = {
  name: string;
};

export type StudentProfilePreference = {
  target_role: string;
  preferred_cities: string[];
  preferred_industries: string[];
};

export type StudentProfileEducation = {
  school: string | null;
  level: string | null;
  major: string | null;
  graduation_year: number | null;
  evidence_refs: string[];
};

export type StudentProfileSkill = {
  name: string;
  category: "frontend" | "backend" | "data" | "ai" | "testing" | "tooling" | "soft" | "other";
  level: number;
  evidence_refs: string[];
};

export type StudentProfileCertificate = {
  name: string;
  issuer: string | null;
  acquired_at: string | null;
  evidence_refs: string[];
};

export type StudentProfileExperienceKind = "project" | "internship" | "competition";

export type StudentProfileExperienceItem = {
  kind: StudentProfileExperienceKind;
  title: string;
  organization: string | null;
  role: string | null;
  period: string | null;
  tech_stack: string[];
  responsibilities: string[];
  outcomes: string[];
  evidence_refs: string[];
};

export type StudentProfileEvaluation = {
  dimension_scores: DimensionScores;
  completeness_score: number;
  competitiveness_score: number;
  missing_items: string[];
  warnings: string[];
};

export type StudentProfileParseMeta = {
  parser: "manual" | "agent";
  model: string | null;
  confidence: number;
  warnings: string[];
};

export type StudentProfileRecord = {
  id: number;
  source_type: StudentProfileSourceType;
  source_digest: string;
  basic_info: StudentProfileBasicInfo;
  preference: StudentProfilePreference;
  education: StudentProfileEducation;
  skills: StudentProfileSkill[];
  certificates: StudentProfileCertificate[];
  experiences: StudentProfileExperienceItem[];
  self_assessment: StudentProfileSelfAssessment;
  evidences: StudentProfileEvidence[];
  evaluation: StudentProfileEvaluation;
  parse_meta: StudentProfileParseMeta;
  summary: string;
  created_at: string;
};

export type CreateStudentProfileRequest = {
  basic_info: StudentProfileBasicInfo;
  preference: StudentProfilePreference;
  education: StudentProfileEducation;
  skills: StudentProfileSkill[];
  certificates?: StudentProfileCertificate[];
  experiences?: StudentProfileExperienceItem[];
  self_assessment?: Partial<StudentProfileSelfAssessment>;
  evidences?: StudentProfileEvidence[];
  summary?: string;
};

export type CreateStudentProfileFromResumeRequest = {
  file_name: string;
  file_content?: string;
  file_images?: Array<{
    data: string;
    mimeType: string;
  }>;
  target_role?: string;
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
  evidence_refs: string[];
};

export type MatchRequirementCategory =
  | "skill"
  | "certificate"
  | "education"
  | "experience"
  | "soft_quality";

export type MatchRequirementImportance = "must" | "important" | "bonus";

export type MatchRequirementEvidenceType =
  | "project"
  | "internship"
  | "certificate"
  | "education"
  | "self_assessment";

export type MatchRequirement = {
  id: string;
  dimension: DimensionKey;
  label: string;
  category: MatchRequirementCategory;
  importance: MatchRequirementImportance;
  expected_level: number;
  weight: number;
  evidence_types: MatchRequirementEvidenceType[];
};

export type MatchRequirementScore = MatchRequirement & {
  score: number;
  matched: boolean;
  semantic_score: number;
  level_score: number;
  evidence_strength: number;
  experience_score: number;
  evidence_refs: string[];
  missing_reason: string | null;
};

export type MatchResultLevel = "highly_matched" | "matched" | "basic_match" | "needs_improvement";

export type CreateMatchRequest = {
  student_profile_id: number;
  job_portrait_name: string;
  force_recalculate?: boolean;
};

export type MatchResultSummary = {
  id: number;
  student_profile_id: number;
  job_portrait_name: string;
  job_portrait_snapshot: ManualJobPortraitRecord | null;
  job_title?: string | null;
  job_profile_version: number;
  scoring_version: string;
  input_fingerprint: string;
  from_cache: boolean;
  dimension_scores: DimensionScores;
  total_score: number;
  confidence: number;
  level: MatchResultLevel;
  created_at: string;
};

export type MatchResultDetail = MatchResultSummary & {
  gaps: MatchGapItem[];
  suggestions: string[];
  explanations: MatchExplanationItem[];
  path_recommendations: CareerRouteRecommendation[];
  evidence_refs: string[];
  requirement_scores: MatchRequirementScore[];
  blocking_gaps: MatchRequirementScore[];
  matched_requirements: MatchRequirementScore[];
  weak_requirements: MatchRequirementScore[];
  scoring_snapshot: {
    algorithm_version: string;
    dimension_weights: DimensionScores;
    requirement_count: number;
    evidence_coverage: number;
  };
};

export type MatchListParams = {
  student_profile_id?: number;
  job_portrait_name?: string;
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
  | "job_recommendations"
  | "strengths"
  | "gaps_and_actions"
  | "career_path"
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
  title: string;
  total_score: number;
  created_at: string;
  updated_at: string;
};

export type CareerReportRecord = CareerReportSummary & {
  sections: CareerReportSection[];
  generator_mode: "template" | "ai";
  evidence_refs: string[];
  action_plan: {
    short_term: string[];
    mid_term: string[];
  };
};

export type CreateReportRequest = {
  match_id: number;
};

export type UpdateReportRequest = {
  sections?: CareerReportSection[];
  title?: string;
};

export type ReportListParams = {
  match_id?: number;
};

export type ReportListResponse = {
  total: number;
  items: CareerReportSummary[];
};

export type CareerReportExportFormat = "pdf" | "markdown";

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

export type CareerPathRelationType = "promotion" | "transition" | "skill_migration";

export type CareerPathTransitionCost = "low" | "medium" | "high";

export type CareerPathNodeCategory = "target" | "promotion" | "transition";

export type CareerPathNode = {
  id: string;
  portrait_id: number | null;
  role_key: string;
  title: string;
  description: string;
  family: string;
  level: number;
  aliases: string[];
  typical_skills: string[];
  category: CareerPathNodeCategory;
  is_target: boolean;
};

export type CareerPathEdge = {
  id: string;
  source: string;
  target: string;
  relation_type: CareerPathRelationType;
  reason: string;
  required_skills: string[];
  gap_skills: string[];
  transition_cost: CareerPathTransitionCost;
  direction_label: string;
  score: number;
};

export type CareerRouteStep = {
  node_id: string;
  role_key: string;
  title: string;
  relation_type: CareerPathRelationType | null;
  reason: string | null;
  required_skills: string[];
  transition_cost: CareerPathTransitionCost | null;
  gap_skills: string[];
};

export type CareerRouteRecommendation = {
  route_id: string;
  route_type: CareerPathRelationType;
  title: string;
  summary: string;
  suitability_score: number;
  missing_skills: string[];
  steps: CareerRouteStep[];
};

export type CareerPathGraphResponse = {
  portrait_id: number;
  job_title: string;
  student_profile_id: number | null;
  depth: number;
  canonical_role_key: string;
  canonical_role_title: string;
  target_node_id: string;
  nodes: CareerPathNode[];
  edges: CareerPathEdge[];
  promotion_routes: CareerRouteRecommendation[];
  transition_routes: CareerRouteRecommendation[];
};

export type CareerPathV2GraphResponse = {
  portrait_id: number;
  job_title: string;
  depth: number;
  target_node_id: string;
  graph_version: string;
  graph_generated_at: string;
  graph_stats: {
    node_count: number;
    edge_count: number;
    promotion_edge_count: number;
    transition_edge_count: number;
    isolated_node_count: number;
    isolated_node_ratio: number;
  };
  nodes: CareerPathNode[];
  edges: CareerPathEdge[];
  promotion_routes: CareerRouteRecommendation[];
  transition_routes: CareerRouteRecommendation[];
};

export type CareerPathTargetOption = {
  portrait_id: number;
  job_name: string;
  category: string;
  graph_version: string;
};

export type CareerPathTargetOptionsResponse = {
  items: CareerPathTargetOption[];
};

export type CareerPathV2GenerateRequest = {
  force_rebuild?: boolean;
  max_candidates_per_node?: number;
  /** 是否使用 Agent 推理生成图谱关系，默认 false 走规则引擎 */
  use_agent?: boolean;
};

export type CareerPathV2GenerateResponse = {
  graph_version: string;
  generated_at: string;
  /** 生成模式：agent 为 AI 推理，rule 为规则引擎 */
  generation_mode: "agent" | "rule";
  nodes_written: number;
  edges_written: number;
  candidate_pairs: number;
  validated_pairs: number;
  promotion_edges: number;
  transition_edges: number;
  skill_migration_edges: number;
  transition_path_coverage: {
    jobs_with_paths: number;
    min_paths_required: number;
    target_job_count: number;
  };
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

export type AiWarningCode =
  | "EVIDENCE_INSUFFICIENT"
  | "KNOWLEDGE_SEARCH_FAILED"
  | "REPORT_GENERATION_FAILED"
  | "FINAL_SUMMARY_FALLBACK";

export type PiToolName =
  | "task_planning"
  | "context_lookup"
  | "knowledge_search"
  | "match_evaluation"
  | "report_generation"
  | "job_comic_generation"
  | "final_answer";

export type AiStepTraceStatus = "success" | "warning" | "error" | "skipped";

export type AiStepTraceItem = {
  step_id: string;
  tool: PiToolName;
  title: string;
  status: AiStepTraceStatus;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  error_code?: string;
};

export type ResumeBasicInfoInput = {
  name: string;
  phone: string;
  email: string;
  target_position: string;
  target_city?: string;
};

export type ResumeEducationInput = {
  school: string;
  major: string;
  degree: string;
  period: string;
  gpa?: string;
  core_courses?: string;
  honors?: string;
};

export type ResumeExperienceInput = {
  organization: string;
  role: string;
  period: string;
  type?: "project" | "internship" | "competition" | "campus";
  background?: string;
  tech_stack?: string;
  responsibilities: string;
  achievements: string;
  difficulties?: string;
};

export type ResumeQualityWarningCode =
  | "NO_EXPERIENCE"
  | "ODD_EDUCATION_PERIOD"
  | "INVALID_PORTFOLIO_LINK"
  | "TARGET_ROLE_MISMATCH";

export type ResumeQualityWarning = {
  code: ResumeQualityWarningCode;
  message: string;
};

export type CreateResumeHtmlRequest = {
  basic: ResumeBasicInfoInput;
  summary?: string;
  educations: ResumeEducationInput[];
  experiences: ResumeExperienceInput[];
  skills: string;
  certificates?: string;
  awards?: string;
  portfolio_links?: string;
};

export type ResumeHtmlResponse = {
  resume_id: number;
  trace_id: string;
  model: string | null;
  html: string;
  generated_at: string;
  quality_warnings?: ResumeQualityWarning[];
};

export type ResumeHtmlRecord = {
  id: number;
  trace_id: string;
  model: string | null;
  basic_name: string;
  target_position: string;
  summary: string | null;
  input_payload: CreateResumeHtmlRequest;
  html: string;
  created_at: string;
};

export type ResumeHtmlListItem = Omit<ResumeHtmlRecord, "html" | "input_payload">;

export type ResumeHtmlListResponse = {
  total: number;
  items: ResumeHtmlListItem[];
};

export type CreateAiPolishRequest = {
  content: string;
  section_key?: string;
  section_title?: string;
};
export type AiPolishResponse = {
  polished_content: string;
};

export type ApiErrorResponse = StructuredApiError;
