import type {
  CareerReportRecord,
  CareerReportSection,
  ReportListParams,
  ReportListResponse,
} from "@career/contracts/types";

/**
 * 文件作用：定义报告领域仓储抽象接口。
 * 边界约束：service 只能通过该抽象读写报告数据，不允许直接依赖具体存储实现。
 */
export type CareerReportCreateInput = Omit<CareerReportRecord, "id" | "created_at" | "updated_at">;

export interface ReportRepository {
  createReport(input: CareerReportCreateInput): Promise<CareerReportRecord>;
  listReports(params: ReportListParams): Promise<ReportListResponse>;
  getReportById(reportId: number): Promise<CareerReportRecord | null>;
  updateReport(
    reportId: number,
    sections: CareerReportSection[],
  ): Promise<CareerReportRecord | null>;
}
