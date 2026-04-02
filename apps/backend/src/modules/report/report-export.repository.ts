import type {
  CareerReportExportRecord,
  ReportExportListResponse,
} from "@career/contracts/types";

/**
 * 文件作用：定义报告导出记录仓储抽象。
 * 边界约束：service 只依赖导出记录抽象，不感知 JSON 或数据库细节。
 */
export type CareerReportExportCreateInput = Omit<CareerReportExportRecord, "created_at">;

export interface ReportExportRepository {
  reserveNextExportId(): Promise<number>;
  createExportRecord(input: CareerReportExportCreateInput): Promise<CareerReportExportRecord>;
  listExportRecordsByReportId(reportId: number): Promise<ReportExportListResponse>;
  getExportRecordById(exportId: number): Promise<CareerReportExportRecord | null>;
}
