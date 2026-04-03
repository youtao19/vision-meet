import type {
  AgentDeliverable,
  AgentPlanStep,
  AgentStepTraceItem,
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
  deliverables: AgentDeliverable[];
  force_recalculate: boolean;
  top_k: number;
  planned_steps: AgentPlanStep[];
  step_trace: AgentStepTraceItem[];
  result: AiTaskResult;
  error_code?: string;
  error_message?: string;
  created_at: string;
  finished_at: string;
};

export type AiTaskRecord = AiTaskCreateInput & {
  id: number;
};

export interface AiRepository {
  createTask(input: AiTaskCreateInput): Promise<AiTaskRecord>;
  getTaskById(taskId: number): Promise<AiTaskRecord | undefined>;
}
