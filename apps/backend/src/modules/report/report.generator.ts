import type {
  CareerReportSection,
  MatchResultDetail,
  JobRecord,
  StudentProfileRecord,
} from "@career/contracts/types";

/**
 * 文件作用：定义报告生成器抽象。
 * 设计边界：service 只依赖该接口，后续可平滑替换为 LLM 或混合生成方案。
 */
export type ReportGeneratorInput = {
  match: MatchResultDetail;
  profile: StudentProfileRecord;
  job: JobRecord;
};

export interface ReportGenerator {
  /**
   * 作用：基于匹配结果、学生画像和岗位信息生成结构化报告章节。
   * 参数：input 为报告生成所需的全部上下文快照。
   * 返回：固定顺序的结构化章节数组，供前端展示和后续编辑。
   * 注意：当前实现必须稳定可复现，不允许引入随机输出。
   */
  generate(input: ReportGeneratorInput): CareerReportSection[];
}
