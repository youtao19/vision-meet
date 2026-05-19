import type {
  AiDeliverable,
  AiPlanStep,
  CreateResumeHtmlRequest,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
  AiStepTraceItem,
  AiTaskResult,
  AiTaskStatus,
} from "@career/contracts/types";

/**
 * 文件作用：定义 AI 中枢任务快照的存储抽象。
 * 设计边界：当前先复用既有任务记录结构，后续如果引入更多 AI 任务类型或会话状态，再优先在这一层扩展。
 */
export type AiTaskCreateInput = {
  trace_id: string;
  model: string | null;
  status: AiTaskStatus;
  student_profile_id: number;
  job_id: number;
  objective: string;
  deliverables: AiDeliverable[];
  force_recalculate: boolean;
  top_k: number;
  planned_steps: AiPlanStep[];
  step_trace: AiStepTraceItem[];
  result: AiTaskResult;
  error_code?: string;
  error_message?: string;
  created_at: string;
  finished_at: string;
};

export type AiTaskRecord = AiTaskCreateInput & {
  id: number;
};

export type ResumeHtmlRecordCreateInput = {
  trace_id: string;
  model: string | null;
  basic_name: string;
  target_position: string;
  summary: string | null;
  input_payload: CreateResumeHtmlRequest;
  html: string;
};

export type ResumeHtmlListQuery = {
  offset: number;
  limit: number;
};

export interface AiRepository {
  createTask(input: AiTaskCreateInput): Promise<AiTaskRecord>;
  getTaskById(taskId: number): Promise<AiTaskRecord | undefined>;
  createResumeHtmlRecord(input: ResumeHtmlRecordCreateInput): Promise<ResumeHtmlRecord>;
  listResumeHtmlRecords(query: ResumeHtmlListQuery): Promise<ResumeHtmlListResponse>;
  getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord | null>;
}
