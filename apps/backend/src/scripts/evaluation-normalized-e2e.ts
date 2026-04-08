/**
 * 文件作用：抽样验证岗位标准化证据在“画像 -> 匹配 -> 报告”链路中的一致性。
 * 职责边界：该脚本只做离线验收统计，不修改任何业务数据。
 */

import fs from "node:fs";
import path from "node:path";

import { appEnv } from "../shared/config/env.js";
import { createAppPgPool } from "../shared/db/postgres.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

type CliOptions = {
  sampleSize: number;
  reportFile: string;
};

type SampleRow = {
  match_id: number;
  job_id: number;
  job_title: string;
  profile_job_family: string | null;
  normalized_job_family_hint: string | null;
  normalized_title_hint: string | null;
  match_evidence_refs: string[];
  report_evidence_refs: string[];
};

type ValidationRow = {
  match_id: number;
  job_id: number;
  job_title: string;
  expected_family: string | null;
  profile_family: string | null;
  profile_family_ok: boolean;
  match_evidence_ok: boolean;
  report_evidence_ok: boolean;
  status: "pass" | "fail";
  reasons: string[];
};

/**
 * 作用：解析命令行参数，支持样本量和报告输出路径配置。
 * 参数：repoRoot 为仓库根目录绝对路径。
 * 返回：标准化后的脚本参数。
 */
function parseArgs(repoRoot: string): CliOptions {
  const args = process.argv.slice(2);
  const pickArg = (name: string): string | null => {
    const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
    if (prefixed) {
      return prefixed.slice(name.length + 1).trim();
    }
    const index = args.findIndex((arg) => arg === name);
    if (index >= 0 && args[index + 1]) {
      return String(args[index + 1]).trim();
    }
    return null;
  };

  const sampleSize = Number(pickArg("--sample-size") || "30");
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) {
    throw new Error("--sample-size 必须是正整数");
  }

  return {
    sampleSize: Math.floor(sampleSize),
    reportFile: path.resolve(
      repoRoot,
      pickArg("--report-file") || "docs/评测结果-岗位标准化证据一致性.md",
    ),
  };
}

function hasExactEvidence(evidenceRefs: string[], expected: string): boolean {
  return evidenceRefs.some((item) => item.trim() === expected);
}

function buildExpectedFamilyEvidence(expectedFamily: string | null): string | null {
  if (!expectedFamily) {
    return null;
  }
  return `岗位族归一：${expectedFamily}`;
}

/**
 * 作用：执行单条样本一致性校验。
 * 参数：row 为抽样记录。
 * 返回：带失败原因的结构化验收结果。
 */
function validateRow(row: SampleRow): ValidationRow {
  const reasons: string[] = [];
  const expectedFamily = row.normalized_job_family_hint;

  let profileFamilyOk = true;
  let matchEvidenceOk = true;
  let reportEvidenceOk = true;

  if (expectedFamily) {
    profileFamilyOk = row.profile_job_family === expectedFamily;
    if (!profileFamilyOk) {
      reasons.push("画像岗位族与标准岗位族不一致");
    }

    const expectedFamilyEvidence = buildExpectedFamilyEvidence(expectedFamily);
    matchEvidenceOk = expectedFamilyEvidence
      ? hasExactEvidence(row.match_evidence_refs, expectedFamilyEvidence)
      : true;
    if (!matchEvidenceOk) {
      reasons.push("匹配证据缺少岗位族归一字段");
    }

    reportEvidenceOk = expectedFamilyEvidence
      ? hasExactEvidence(row.report_evidence_refs, expectedFamilyEvidence)
      : true;
    if (!reportEvidenceOk) {
      reasons.push("报告证据缺少岗位族归一字段");
    }
  }

  if (!expectedFamily) {
    reasons.push("样本缺少 job_normalized 岗位族提示，已跳过一致性判定");
  }

  return {
    match_id: row.match_id,
    job_id: row.job_id,
    job_title: row.job_title,
    expected_family: expectedFamily,
    profile_family: row.profile_job_family,
    profile_family_ok: profileFamilyOk,
    match_evidence_ok: matchEvidenceOk,
    report_evidence_ok: reportEvidenceOk,
    status: reasons.length === 0 ? "pass" : "fail",
    reasons,
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

function buildMarkdownReport(input: {
  generatedAt: string;
  sampleSize: number;
  samplesTotal: number;
  evaluableTotal: number;
  passedTotal: number;
  profileFamilyPassRate: number;
  matchEvidencePassRate: number;
  reportEvidencePassRate: number;
  overallPassRate: number;
  failedRows: ValidationRow[];
  warnings?: string[];
}): string {
  const lines: string[] = [];
  lines.push("# 岗位标准化证据一致性评测报告");
  lines.push("");
  lines.push(`生成时间：${input.generatedAt}`);
  lines.push("");
  lines.push("## 1. 样本信息");
  lines.push("");
  lines.push(`- 抽样目标：${input.sampleSize}`);
  lines.push(`- 实际样本：${input.samplesTotal}`);
  lines.push(`- 可评估样本：${input.evaluableTotal}`);
  lines.push("");
  lines.push("## 2. 指标结果");
  lines.push("");
  lines.push(`- 画像岗位族一致率：${input.profileFamilyPassRate}`);
  lines.push(`- 匹配证据命中率：${input.matchEvidencePassRate}`);
  lines.push(`- 报告证据命中率：${input.reportEvidencePassRate}`);
  lines.push(`- 综合通过率：${input.overallPassRate}`);
  lines.push("");
  lines.push("## 3. 未通过样本");
  lines.push("");
  if (input.failedRows.length === 0) {
    lines.push("- 无");
    lines.push("");
  } else {
    input.failedRows.slice(0, 20).forEach((item) => {
      lines.push(
        `- match_id=${item.match_id} / job_id=${item.job_id} / 岗位=${item.job_title} / 原因=${item.reasons.join("；")}`,
      );
    });
    lines.push("");
  }

  lines.push("## 4. 运行告警");
  lines.push("");
  if (!input.warnings || input.warnings.length === 0) {
    lines.push("- 无");
    lines.push("");
  } else {
    input.warnings.forEach((warning) => lines.push(`- ${warning}`));
    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const repoRoot = resolveRepositoryRoot();
  const options = parseArgs(repoRoot);
  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });

  try {
    const result = await pool.query<SampleRow>(
      `
        WITH latest_profiles AS (
          SELECT DISTINCT ON (job_id)
            job_id,
            job_family
          FROM v2_job_profiles
          ORDER BY job_id, profile_version DESC
        ),
        latest_reports AS (
          SELECT DISTINCT ON (match_id)
            match_id,
            evidence_refs
          FROM career_reports
          ORDER BY match_id, version DESC
        )
        SELECT
          m.id AS match_id,
          m.job_id,
          j.title AS job_title,
          p.job_family AS profile_job_family,
          norm.normalized_job_family AS normalized_job_family_hint,
          norm.normalized_title AS normalized_title_hint,
          m.evidence_refs AS match_evidence_refs,
          COALESCE(r.evidence_refs, ARRAY[]::TEXT[]) AS report_evidence_refs
        FROM match_results m
        INNER JOIN jobs j
          ON j.id = m.job_id
        LEFT JOIN latest_profiles p
          ON p.job_id = m.job_id
        LEFT JOIN latest_reports r
          ON r.match_id = m.id
        LEFT JOIN LATERAL (
          SELECT
            n.normalized_title,
            n.normalized_job_family,
            n.confidence
          FROM job_normalized n
          WHERE
            n.normalized_title = j.title
            OR (
              j.source_row_id IS NOT NULL
              AND n.normalized_payload ->> 'source_row_id' = j.source_row_id
            )
          ORDER BY n.confidence DESC, n.updated_at DESC
          LIMIT 1
        ) norm ON true
        ORDER BY m.created_at DESC
        LIMIT $1
      `,
      [options.sampleSize],
    );

    const rows = result.rows.map((row) => ({
      ...row,
      match_evidence_refs: Array.isArray(row.match_evidence_refs) ? row.match_evidence_refs : [],
      report_evidence_refs: Array.isArray(row.report_evidence_refs) ? row.report_evidence_refs : [],
    }));

    const warnings: string[] = [];
    if (rows.length === 0) {
      warnings.push("当前没有 match_results/career_reports 样本，已输出空样本报告");
    }

    const validations = rows.map((row) => validateRow(row));
    const evaluable = validations.filter((item) => item.expected_family !== null);
    const passed = evaluable.filter((item) => item.status === "pass");
    const failedRows = validations.filter((item) => item.status === "fail");

    const profileFamilyPassRate = ratio(
      evaluable.filter((item) => item.profile_family_ok).length,
      evaluable.length,
    );
    const matchEvidencePassRate = ratio(
      evaluable.filter((item) => item.match_evidence_ok).length,
      evaluable.length,
    );
    const reportEvidencePassRate = ratio(
      evaluable.filter((item) => item.report_evidence_ok).length,
      evaluable.length,
    );
    const overallPassRate = ratio(passed.length, evaluable.length);

    const generatedAt = new Date().toISOString();
    const summary = {
      generated_at: generatedAt,
      sample_size: options.sampleSize,
      sampled_rows: rows.length,
      evaluable_rows: evaluable.length,
      passed_rows: passed.length,
      failed_rows: failedRows.length,
      metrics: {
        profile_family_pass_rate: profileFamilyPassRate,
        match_evidence_pass_rate: matchEvidencePassRate,
        report_evidence_pass_rate: reportEvidencePassRate,
        overall_pass_rate: overallPassRate,
      },
      failed_examples: failedRows.slice(0, 10).map((item) => ({
        match_id: item.match_id,
        job_id: item.job_id,
        reasons: item.reasons,
      })),
      warnings,
      report_file: path.relative(repoRoot, options.reportFile),
    };

    const report = buildMarkdownReport({
      generatedAt,
      sampleSize: options.sampleSize,
      samplesTotal: rows.length,
      evaluableTotal: evaluable.length,
      passedTotal: passed.length,
      profileFamilyPassRate,
      matchEvidencePassRate,
      reportEvidencePassRate,
      overallPassRate,
      failedRows,
      warnings,
    });

    fs.mkdirSync(path.dirname(options.reportFile), { recursive: true });
    fs.writeFileSync(options.reportFile, report, "utf8");

    // eslint-disable-next-line no-console
    console.log("[evaluation:normalized:e2e]", JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[evaluation:normalized:e2e] failed", error);
  process.exitCode = 1;
});
