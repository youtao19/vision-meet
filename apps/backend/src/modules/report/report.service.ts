import type {
  CareerReportRecord,
  CareerReportSection,
  CareerReportSectionKey,
  CreateReportRequest,
  ReportListParams,
  ReportListResponse,
  UpdateReportRequest,
} from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { MatchingRepository } from "../matching/matching.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { ReportGenerator } from "./report.generator.js";
import type { ReportRepository } from "./report.repository.js";

const SECTION_ORDER: CareerReportSectionKey[] = [
  "overview",
  "match_analysis",
  "strengths",
  "gaps_and_actions",
  "short_term_plan",
  "mid_term_plan",
];

function assertValidSectionSet(sections: CareerReportSection[]): void {
  if (sections.length !== SECTION_ORDER.length) {
    throw new HttpError(400, "REPORT_SECTION_INVALID", "报告章节数量不合法");
  }

  const keys = sections.map((item) => item.key);
  const unique = new Set(keys);
  const expected = SECTION_ORDER.join(",");
  const actual = [...unique].sort().join(",");

  if (unique.size !== SECTION_ORDER.length || actual !== [...SECTION_ORDER].sort().join(",")) {
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
  return SECTION_ORDER.map((key) => sectionMap.get(key)!);
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
  createReport(input: CreateReportRequest): CareerReportRecord;

  /**
   * 作用：查询某个匹配结果下的所有报告版本。
   * 参数：params 目前只支持 match_id。
   * 返回：按 version 倒序排列的报告摘要列表。
   * 注意：若 match_id 不存在，应优先返回明确 404。
   */
  listReports(params: ReportListParams): ReportListResponse;

  /**
   * 作用：查询单份报告详情。
   * 参数：reportId 为报告主键。
   * 返回：完整报告记录，包含结构化章节。
   * 注意：不存在时返回 REPORT_NOT_FOUND。
   */
  getReport(reportId: number): CareerReportRecord;

  /**
   * 作用：保存当前报告版本的结构化章节编辑结果。
   * 参数：reportId 为目标报告；input.sections 必须是固定章节全集。
   * 返回：更新后的报告详情。
   * 注意：本次保存只更新当前版本，不复制新版本。
   */
  updateReport(reportId: number, input: UpdateReportRequest): CareerReportRecord;
}

export function createReportService(
  reportRepository: ReportRepository,
  matchingRepository: MatchingRepository,
  profileRepository: ProfileRepository,
  jobsRepository: JobsRepository,
  generator: ReportGenerator,
): ReportService {
  function ensureMatchExists(matchId: number) {
    const match = matchingRepository.getMatchResultById(matchId);
    if (!match) {
      throw new HttpError(404, "MATCH_NOT_FOUND", "匹配结果不存在");
    }
    return match;
  }

  function createReport(input: CreateReportRequest): CareerReportRecord {
    const match = ensureMatchExists(input.match_id);

    const profile = profileRepository.getStudentProfileById(match.student_profile_id);
    if (!profile) {
      throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
    }

    const job = jobsRepository.getJobById(match.job_id);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在或已下线");
    }

    const existing = reportRepository.listReports({ match_id: input.match_id }).items;
    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
    const sections = generator.generate({
      match,
      profile,
      job,
    });

    assertValidSectionSet(sections);

    return reportRepository.createReport({
      match_id: input.match_id,
      version: nextVersion,
      student_profile_id: match.student_profile_id,
      job_id: match.job_id,
      total_score: match.total_score,
      sections: normalizeSectionOrder(sections),
    });
  }

  function listReports(params: ReportListParams): ReportListResponse {
    ensureMatchExists(params.match_id);
    return reportRepository.listReports(params);
  }

  function getReport(reportId: number): CareerReportRecord {
    const report = reportRepository.getReportById(reportId);
    if (!report) {
      throw new HttpError(404, "REPORT_NOT_FOUND", "报告不存在");
    }
    return report;
  }

  function updateReport(reportId: number, input: UpdateReportRequest): CareerReportRecord {
    const existing = getReport(reportId);
    assertValidSectionSet(input.sections);

    const updated = reportRepository.updateReport(existing.id, normalizeSectionOrder(input.sections));
    if (!updated) {
      throw new HttpError(404, "REPORT_NOT_FOUND", "报告不存在");
    }

    return updated;
  }

  return {
    createReport,
    listReports,
    getReport,
    updateReport,
  };
}
