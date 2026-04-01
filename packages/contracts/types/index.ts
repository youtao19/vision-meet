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

export type StudentProfileRecord = {
  id: number;
  name: string;
  target_role: string;
  education_level: string | null;
  major: string | null;
  graduation_year: number | null;
  skills: string[];
  certificates: string[];
  experience: StudentProfileExperience;
  self_assessment: StudentProfileSelfAssessment;
  dimension_scores: StudentProfileDimensionScores;
  completeness_score: number;
  competitiveness_score: number;
  missing_items: string[];
  personal_summary: string | null;
  summary: string;
  created_at: string;
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

export type StudentProfileDimensionScores = {
  base_requirements: number;
  professional_skills: number;
  professional_quality: number;
  development_potential: number;
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

export type ListStudentProfilesResponse = {
  total: number;
  items: StudentProfileRecord[];
};

export type ApiErrorResponse = {
  detail: string | Record<string, unknown>;
};
