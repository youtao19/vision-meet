import type {
  CareerPathGraphResponse,
  CareerReportSection,
  KnowledgeSearchResultItem,
  MatchResultDetail,
  JobRecord,
  StudentProfileRecord,
} from "@career/contracts/types";

/**
 * 文件作用：定义报告生成器抽象。
 * 设计边界：service 只依赖该接口，当前默认实现为稳定可复现的模板生成。
 */
export type ReportGeneratorInput = {
  match: MatchResultDetail;
  profile: StudentProfileRecord;
  job: JobRecord;
  career_path?: CareerPathGraphResponse | null;
  knowledge_hits?: KnowledgeSearchResultItem[];
  agent_summary?: string;
};

export type ReportGeneratorResult = {
  sections: CareerReportSection[];
  mode: "template";
  evidence_refs: string[];
  action_plan: {
    short_term: string[];
    mid_term: string[];
  };
};

export interface ReportGenerator {
  /**
   * 作用：基于匹配结果、学生画像和岗位信息生成结构化报告章节。
   * 参数：input 为报告生成所需的全部上下文快照。
   * 返回：固定顺序的结构化章节数组，供前端展示和后续编辑。
   * 注意：当前实现必须稳定可复现，不允许引入随机输出。
   */
  generate(input: ReportGeneratorInput): Promise<ReportGeneratorResult>;
}
