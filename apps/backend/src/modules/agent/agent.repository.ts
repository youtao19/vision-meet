import type {
  AgentDeliverable,
  AgentPlanStep,
  AgentStepTraceItem,
  AgentTaskResult,
  AgentTaskStatus,
} from "@career/contracts/types";

/**
 * 文件作用：定义任务型 agent 运行记录的存储抽象。
 * 设计边界：repository 负责保存任务快照，service 决定如何规划和执行工具。
 */
export type AgentTaskCreateInput = {
  trace_id: string;
  model: string | null;
  status: AgentTaskStatus;
  student_profile_id: number;
  job_id: number;
  objective: string;
  deliverables: AgentDeliverable[];
  force_recalculate: boolean;
  top_k: number;
  planned_steps: AgentPlanStep[];
  step_trace: AgentStepTraceItem[];
  result: AgentTaskResult;
  error_code?: string;
  error_message?: string;
  created_at: string;
  finished_at: string;
};

export type AgentTaskRecord = AgentTaskCreateInput & {
  id: number;
};

export interface AgentRepository {
  createTask(input: AgentTaskCreateInput): Promise<AgentTaskRecord>;
  getTaskById(taskId: number): Promise<AgentTaskRecord | undefined>;
}
