import type {
  CareerReportExportFormat,
  CareerReportRecord,
  JobRecord,
  StudentProfileRecord,
} from "@career/contracts/types";

export type ReportExportRenderInput = {
  report: CareerReportRecord;
  profile: StudentProfileRecord;
  job: JobRecord;
};

export type ReportExportOutput = {
  format: CareerReportExportFormat;
  bytes: Buffer;
  fileExtension: string;
};

/**
 * 文件作用：定义报告导出器抽象。
 * 设计边界：service 仅负责业务编排，具体 PDF 渲染方案由 exporter 实现。
 */
export interface ReportExporter {
  /**
   * 作用：把结构化职业报告渲染为可下载文件。
   * 参数：input 为渲染所需的报告、学生画像和岗位信息。
   * 返回：包含文件字节流和扩展名的导出结果。
   * 注意：首版固定输出 PDF，后续可在同一接口下扩展更多格式。
   */
  export(input: ReportExportRenderInput): Promise<ReportExportOutput>;
}
