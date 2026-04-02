import type { AgentToolTraceItem, AgentWarningCode } from "@career/contracts/types";

/**
 * 文件作用：定义 agent 编排运行记录的存储抽象。
 * 设计边界：当前只负责审计落库，不暴露额外查询接口，后续需要列表/详情时再扩展。
 */
export type AgentRunStatus = "success" | "partial_success" | "failed";

export type AgentRunCreateInput = {
  trace_id: string;
  model: string | null;
  student_profile_id: number;
  job_id: number;
  force_recalculate: boolean;
  top_k: number;
  status: AgentRunStatus;
  knowledge_hit_count: number;
  match_result_id: number | null;
  report_id: number | null;
  warnings: AgentWarningCode[];
  tool_trace: AgentToolTraceItem[];
  error_code?: string;
  error_message?: string;
};

export type AgentRunRecord = AgentRunCreateInput & {
  id: number;
  created_at: string;
};

export interface AgentRepository {
  createRun(input: AgentRunCreateInput): AgentRunRecord;
}
