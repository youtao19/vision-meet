import fs from "node:fs";
import path from "node:path";

import type {
  CareerReportExportRecord,
  CareerReportRecord,
  KnowledgeSearchResultItem,
  CareerReportSection,
  CreateReportExportRequest,
  CreateReportRequest,
  ReportListParams,
  ReportExportListResponse,
  ReportListResponse,
  UpdateReportRequest,
  StudentProfileRecord,
  MatchResultDetail,
} from "@career/contracts/types";

import type { MatchingRepository } from "../matching/matching.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getProfileName } from "../profile/profile.selectors.js";
import type { ReportExportRepository } from "./report-export.repository.js";
import type { ReportExporter } from "./report.exporter.js";
import type { ReportGenerator, ReportTargetJob } from "./report.generator.js";
import type { ReportRepository } from "./report.repository.js";
import { REPORT_SECTION_ORDER, createLegacyReportSection } from "./report.sections.js";

function assertValidSectionSet(sections: CareerReportSection[]): void {
  if (sections.length !== REPORT_SECTION_ORDER.length) {
    throw new HttpError(400, "REPORT_SECTION_INVALID", "报告章节数量不合法");
  }

  const keys = sections.map((item) => item.key);
  const unique = new Set(keys);
  const actual = [...unique].sort().join(",");

  if (
    unique.size !== REPORT_SECTION_ORDER.length ||
    actual !== [...REPORT_SECTION_ORDER].sort().join(",")
  ) {
    throw new HttpError(400, "REPORT_SECTION_INVALID", "报告章节集合不完整或存在重复");
  }

  for (const section of sections) {
    if (!section.title.trim() || !section.content.trim()) {
      throw new HttpError(400, "REPORT_SECTION_INVALID", "报告章节标题与内容不能为空");
    }
  }
}

function normalizeSectionOrder(sections: CareerReportSection[]): CareerReportSection[] {
  const sectionMap = new Map(sections.map((item) => [item.key, item]));
  return REPORT_SECTION_ORDER.map((key) => sectionMap.get(key) ?? createLegacyReportSection(key));
}

/**
 * 作用：把结构化报告内容拼接为 Markdown 文本。
 * 设计说明：Markdown 导出不依赖浏览器渲染，直接由 service 侧根据章节结构生成，保证导出链路轻量可控。
 */
function renderReportMarkdown(input: {
  report: CareerReportRecord;
  profile: StudentProfileRecord;
  job: ReportTargetJob;
}): string {
  const lines: string[] = [
    "# 职业规划报告",
    "",
    `- 报告编号：#${input.report.id}`,
    `- 报告版本：V${input.report.version}`,
    `- 学生姓名：${getProfileName(input.profile)}`,
    `- 目标岗位：${input.job.title}`,
    `- 综合匹配分：${input.report.total_score} 分`,
    `- 导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    "",
    "## 决策依据",
    "",
  ];

  if (input.report.evidence_refs.length > 0) {
    input.report.evidence_refs.forEach((item) => {
      lines.push(`- ${item}`);
    });
  } else {
    lines.push("- 暂无");
  }

  lines.push("", "## 行动计划", "", "### 短期计划", "");
  if (input.report.action_plan.short_term.length > 0) {
    input.report.action_plan.short_term.forEach((item) => {
      lines.push(`- ${item}`);
    });
  } else {
    lines.push("- 暂无");
  }

  lines.push("", "### 中期计划", "");
  if (input.report.action_plan.mid_term.length > 0) {
    input.report.action_plan.mid_term.forEach((item) => {
      lines.push(`- ${item}`);
    });
  } else {
    lines.push("- 暂无");
  }

  for (const section of input.report.sections) {
    lines.push("", `## ${section.title}`, "");
    const contentLines = section.content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (contentLines.length === 0) {
      lines.push("暂无内容");
      continue;
    }
    lines.push(...contentLines);
  }

  lines.push("");
  return lines.join("\n");
}

function resolveReportTargetJob(match: MatchResultDetail): ReportTargetJob {
  const snapshot = match.job_portrait_snapshot;
  const detail = snapshot?.profile_detail;
  const title = detail?.name?.trim() || match.job_title || match.job_portrait_name;
  if (!title.trim()) {
    throw new HttpError(400, "REPORT_TARGET_JOB_MISSING", "匹配结果缺少目标岗位画像");
  }

  return {
    title,
    category: detail?.category || snapshot?.category || null,
    description: detail?.description || null,
    skills: detail?.skills ?? [],
    career_path: detail?.careerPath ?? [],
  };
}

/**
 * 文件作用：承载职业报告的生成、查询和编辑保存逻辑。
 * 关键约束：报告必须绑定既有 match_id，并基于匹配结果生成可追溯的多版本记录。
 */
export interface ReportService {
  /**
   * 作用：基于既有匹配结果生成一份新的报告版本。
   * 参数：input 仅接受 match_id，禁止脱离匹配结果单独建报告。
   * 返回：创建完成的报告详情。
   * 注意：同一 match_id 每次调用都生成新版本，不覆盖历史版本。
   */
  createReport(
    input: CreateReportRequest,
    context?: ReportCreateContext,
  ): Promise<CareerReportRecord>;

  /**
   * 作用：生成报告并返回内部生成元信息，供 agent 编排层判断是否发生模型降级。
   * 参数：input 为标准创建参数；context 可注入检索证据与 agent 摘要。
   * 返回：报告记录及生成方式元数据。
   * 注意：HTTP 路由通常只需要 createReport，agent 侧才消费该增强结果。
   */
  createReportWithContext(
    input: CreateReportRequest,
    context?: ReportCreateContext,
  ): Promise<ReportCreateResult>;

  /**
   * 作用：查询报告历史；传 match_id 时只查该匹配结果下的报告版本。
   * 参数：params.match_id 可选。
   * 返回：报告摘要列表。
   * 注意：传 match_id 且匹配结果不存在时，应优先返回明确 404。
   */
  listReports(params: ReportListParams): Promise<ReportListResponse>;

  /**
   * 作用：查询单份报告详情。
   * 参数：reportId 为报告主键。
   * 返回：完整报告记录，包含结构化章节。
   * 注意：不存在时返回 REPORT_NOT_FOUND。
   */
  getReport(reportId: number): Promise<CareerReportRecord>;

  /**
   * 作用：保存当前报告版本的结构化章节编辑结果。
   * 参数：reportId 为目标报告；input.sections 必须是固定章节全集。
   * 返回：更新后的报告详情。
   * 注意：本次保存只更新当前版本，不复制新版本。
   */
  updateReport(reportId: number, input: UpdateReportRequest): Promise<CareerReportRecord>;

  /**
   * 作用：删除指定报告版本。
   * 参数：reportId 为报告主键。
   * 返回：无。
   * 注意：关联导出记录由数据库级联删除。
   */
  deleteReport(reportId: number): Promise<void>;

  /**
   * 作用：为指定报告版本生成一份新的导出产物并落盘登记。
   * 参数：reportId 为目标报告主键；input.format 支持 pdf 与 markdown。
   * 返回：导出记录，包含下载路径和文件元数据。
   * 注意：每次导出都会生成新的文件与记录，不覆盖历史产物。
   */
  createReportExport(
    reportId: number,
    input: CreateReportExportRequest,
  ): Promise<CareerReportExportRecord>;

  /**
   * 作用：查询某个报告版本的历史导出记录。
   * 参数：reportId 为报告主键。
   * 返回：按导出时间倒序排列的导出记录列表。
   * 注意：若报告不存在，优先返回 REPORT_NOT_FOUND。
   */
  listReportExports(reportId: number): Promise<ReportExportListResponse>;

  /**
   * 作用：读取单条导出记录。
   * 参数：exportId 为导出记录主键。
   * 返回：导出记录详情。
   * 注意：若记录不存在，返回 REPORT_EXPORT_NOT_FOUND。
   */
  getReportExport(exportId: number): Promise<CareerReportExportRecord>;

  /**
   * 作用：解析导出记录对应的本地文件绝对路径，供下载路由使用。
   * 参数：exportId 为导出记录主键。
   * 返回：文件绝对路径与导出记录。
   * 注意：若文件缺失，视为导出记录已损坏并返回 REPORT_EXPORT_NOT_FOUND。
   */
  resolveReportExportDownload(
    exportId: number,
  ): Promise<{ record: CareerReportExportRecord; absoluteFilePath: string }>;
}

export type ReportServiceOptions = {
  exportDir?: string;
};

export type ReportCreateContext = {
  trace_id?: string;
  knowledge_hits?: KnowledgeSearchResultItem[];
  agent_summary?: string;
};

export type ReportCreateResult = {
  report: CareerReportRecord;
  generator_mode: "template" | "ai";
};

export function createReportService(
  reportRepository: ReportRepository,
  reportExportRepository: ReportExportRepository,
  matchingRepository: MatchingRepository,
  profileRepository: ProfileRepository,
  generator: ReportGenerator,
  exporter: ReportExporter,
  options: ReportServiceOptions = {},
): ReportService {
  const exportDir = options.exportDir || path.join(process.cwd(), "storage", "exports", "reports");

  async function ensureMatchExists(matchId: number) {
    const match = await matchingRepository.getMatchResultById(matchId);
    if (!match) {
      throw new HttpError(404, "MATCH_NOT_FOUND", "匹配结果不存在");
    }
    return match;
  }

  async function createReportWithContext(
    input: CreateReportRequest,
    context?: ReportCreateContext,
  ): Promise<ReportCreateResult> {
    const match = await ensureMatchExists(input.match_id);

    const profile = await profileRepository.getStudentProfileById(match.student_profile_id);
    if (!profile) {
      throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
    }

    const job = resolveReportTargetJob(match);

    const existing = (await reportRepository.listReports({ match_id: input.match_id })).items;
    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
    const generated = await generator.generate({
      trace_id: context?.trace_id,
      match,
      profile,
      job,
      career_path: null,
      knowledge_hits: context?.knowledge_hits,
      agent_summary: context?.agent_summary,
    });

    assertValidSectionSet(generated.sections);

    return {
      report: await reportRepository.createReport({
        match_id: input.match_id,
        version: nextVersion,
        student_profile_id: match.student_profile_id,
        title: `职业规划报告 - ${job.title}`,
        total_score: match.total_score,
        sections: normalizeSectionOrder(generated.sections),
        generator_mode: generated.mode,
        evidence_refs: generated.evidence_refs,
        action_plan: generated.action_plan,
      }),
      generator_mode: generated.mode,
    };
  }

  async function createReport(
    input: CreateReportRequest,
    context?: ReportCreateContext,
  ): Promise<CareerReportRecord> {
    const result = await createReportWithContext(input, context);
    return result.report;
  }

  async function listReports(params: ReportListParams): Promise<ReportListResponse> {
    if (params.match_id) {
      await ensureMatchExists(params.match_id);
    }
    return reportRepository.listReports(params);
  }

  async function getReport(reportId: number): Promise<CareerReportRecord> {
    const report = await reportRepository.getReportById(reportId);
    if (!report) {
      throw new HttpError(404, "REPORT_NOT_FOUND", "报告不存在");
    }
    return report;
  }

  async function getReportExport(exportId: number): Promise<CareerReportExportRecord> {
    const record = await reportExportRepository.getExportRecordById(exportId);
    if (!record) {
      throw new HttpError(404, "REPORT_EXPORT_NOT_FOUND", "报告导出记录不存在");
    }
    return record;
  }

  async function updateReport(
    reportId: number,
    input: UpdateReportRequest,
  ): Promise<CareerReportRecord> {
    const existing = await getReport(reportId);
    if (input.sections) {
      assertValidSectionSet(input.sections);
    }

    const updated = await reportRepository.updateReport(existing.id, {
      sections: input.sections ? normalizeSectionOrder(input.sections) : undefined,
      title: input.title,
    });
    if (!updated) {
      throw new HttpError(404, "REPORT_NOT_FOUND", "报告不存在");
    }

    return updated;
  }

  async function deleteReport(reportId: number): Promise<void> {
    await getReport(reportId);
    const deleted = await reportRepository.deleteReport(reportId);
    if (!deleted) {
      throw new HttpError(404, "REPORT_NOT_FOUND", "报告不存在");
    }
  }

  async function createReportExport(
    reportId: number,
    input: CreateReportExportRequest,
  ): Promise<CareerReportExportRecord> {
    const report = await getReport(reportId);
    const profile = await profileRepository.getStudentProfileById(report.student_profile_id);
    if (!profile) {
      throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
    }

    const match = await ensureMatchExists(report.match_id);
    const job = resolveReportTargetJob(match);

    try {
      const exported =
        input.format === "markdown"
          ? {
              format: "markdown" as const,
              bytes: Buffer.from(renderReportMarkdown({ report, profile, job }), "utf-8"),
              fileExtension: "md",
            }
          : await exporter.export({
              report,
              profile,
              job,
            });

      const exportId = await reportExportRepository.reserveNextExportId();
      const fileName = `report-${report.id}-v${report.version}-${exportId}.${exported.fileExtension}`;
      fs.mkdirSync(exportDir, { recursive: true });
      const absoluteFilePath = path.resolve(exportDir, fileName);
      fs.writeFileSync(absoluteFilePath, exported.bytes);

      return reportExportRepository.createExportRecord({
        id: exportId,
        report_id: report.id,
        format: input.format,
        file_name: fileName,
        file_size_bytes: exported.bytes.byteLength,
        download_path: `/api/v2/report-exports/${exportId}/download`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "报告导出失败";
      throw new HttpError(500, "REPORT_EXPORT_GENERATION_FAILED", message);
    }
  }

  async function listReportExports(reportId: number): Promise<ReportExportListResponse> {
    await getReport(reportId);
    return reportExportRepository.listExportRecordsByReportId(reportId);
  }

  async function resolveReportExportDownload(exportId: number) {
    const record = await getReportExport(exportId);
    const absoluteFilePath = path.resolve(exportDir, record.file_name);

    if (!fs.existsSync(absoluteFilePath)) {
      throw new HttpError(404, "REPORT_EXPORT_NOT_FOUND", "导出文件不存在或已损坏");
    }

    return {
      record,
      absoluteFilePath,
    };
  }

  return {
    createReport,
    createReportWithContext,
    listReports,
    getReport,
    updateReport,
    deleteReport,
    createReportExport,
    listReportExports,
    getReportExport,
    resolveReportExportDownload,
  };
}
