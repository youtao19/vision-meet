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
  skills: string[];
  summary: string;
  created_at: string;
};

export type CreateStudentProfileRequest = {
  name: string;
  target_role: string;
  skills: string[];
};

export type ListStudentProfilesResponse = {
  total: number;
  items: StudentProfileRecord[];
};

export type ApiErrorResponse = {
  detail: string | Record<string, unknown>;
};
