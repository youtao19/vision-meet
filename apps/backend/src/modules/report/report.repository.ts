import type {
  CareerReportExportRecord,
  CareerReportRecord,
  CareerReportSection,
  ReportExportListResponse,
  ReportListParams,
  ReportListResponse,
} from "@career/contracts/types";

/**
 * 文件作用：定义报告领域仓储抽象接口。
 * 边界约束：service 只能通过该抽象读写报告数据，不允许直接依赖具体存储实现。
 */
export type CareerReportCreateInput = Omit<CareerReportRecord, "id" | "created_at" | "updated_at">;

export type CareerReportExportCreateInput = Omit<CareerReportExportRecord, "created_at">;

export interface ReportRepository {
  createReport(input: CareerReportCreateInput): Promise<CareerReportRecord>;
  listReports(params: ReportListParams): Promise<ReportListResponse>;
  getReportById(reportId: number): Promise<CareerReportRecord | null>;
  updateReport(
    reportId: number,
    update: { sections?: CareerReportSection[]; title?: string },
  ): Promise<CareerReportRecord | null>;
  deleteReport(reportId: number): Promise<boolean>;

  /** 报告导出记录 —— career_report_exports 是报告的子表，不属于独立业务域。 */
  reserveNextExportId(): Promise<number>;
  createExportRecord(input: CareerReportExportCreateInput): Promise<CareerReportExportRecord>;
  listExportRecordsByReportId(reportId: number): Promise<ReportExportListResponse>;
  getExportRecordById(exportId: number): Promise<CareerReportExportRecord | null>;
}
