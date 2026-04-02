import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

/**
 * 文件作用：执行“手工抽样”评测闭环，输出可复算的 JSON 汇总和 Markdown 报告。
 * 职责边界：本脚本只读取已标注样本并统计结果，不直接调用数据库或业务接口。
 */

const PASS_THRESHOLD = {
  matchAccuracy: 0.8,
  profileAccuracy: 0.9,
} as const;

const matchSampleSchema = z.object({
  sample_id: z.string().trim().min(1),
  student_profile_id: z.coerce.number().int().positive(),
  job_id: z.coerce.number().int().positive(),
  match_result_id: z.coerce.number().int().positive(),
  expected_key_skills: z.array(z.string().trim().min(1)).min(1),
  observed_key_skills: z.array(z.string().trim().min(1)),
  is_correct: z.boolean(),
  reviewer: z.string().trim().min(1),
  reviewed_at: z.string().trim().min(1),
  notes: z.string(),
});

const profileSampleSchema = z
  .object({
    sample_id: z.string().trim().min(1),
    profile_type: z.string().trim().min(1),
    record_id: z.coerce.number().int().positive(),
    checked_fields: z.coerce.number().int().positive(),
    correct_fields: z.coerce.number().int().nonnegative(),
    accuracy: z.coerce.number().min(0).max(1),
    reviewer: z.string().trim().min(1),
    reviewed_at: z.string().trim().min(1),
    notes: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.correct_fields > value.checked_fields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correct_fields 不能大于 checked_fields",
        path: ["correct_fields"],
      });
    }
  });

type MatchSample = z.infer<typeof matchSampleSchema>;
type ProfileSample = z.infer<typeof profileSampleSchema>;

type EvaluationCliOptions = {
  matchFile: string;
  profileFile: string;
  reportFile: string;
};

type AccuracyMismatch = {
  sample_id: string;
  expected: number;
  provided: number;
};

function parseArgs(repoRoot: string): EvaluationCliOptions {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 ${token} 缺少值`);
    }
    options[key] = value;
    index += 1;
  }

  return {
    matchFile: path.resolve(repoRoot, options["match-file"] || "data/evaluation/match.manual-samples.jsonl"),
    profileFile: path.resolve(
      repoRoot,
      options["profile-file"] || "data/evaluation/profile.manual-samples.jsonl",
    ),
    reportFile: path.resolve(repoRoot, options["report-file"] || "docs/评测结果-手工抽样.md"),
  };
}

/**
 * 作用：逐行读取 JSONL 并执行结构校验。
 * 参数：absoluteFilePath 为样本文件绝对路径；schema 为该文件的行级结构定义。
 * 返回：通过校验的样本数组。
 * 注意：遇到任意一行解析失败会立即抛错并终止评测，避免“脏样本”污染结果。
 */
function readJsonlSamples<T>(absoluteFilePath: string, schema: z.ZodSchema<T>): T[] {
  if (!fs.existsSync(absoluteFilePath) || !fs.statSync(absoluteFilePath).isFile()) {
    throw new Error(`样本文件不存在：${absoluteFilePath}`);
  }

  const raw = fs.readFileSync(absoluteFilePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`样本文件为空：${absoluteFilePath}`);
  }

  return lines.map((line, index) => {
    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(line);
    } catch {
      throw new Error(`JSONL 解析失败：${absoluteFilePath}:${index + 1}`);
    }

    const parsed = schema.safeParse(jsonValue);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join("；");
      throw new Error(`样本字段校验失败：${absoluteFilePath}:${index + 1} -> ${message}`);
    }
    return parsed.data;
  });
}

function toRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

function buildMarkdownReport(input: {
  generatedAt: string;
  options: EvaluationCliOptions;
  matchSamples: MatchSample[];
  profileSamples: ProfileSample[];
  matchAccuracy: number;
  profileAccuracy: number;
  matchPassed: boolean;
  profilePassed: boolean;
  overallPassed: boolean;
  failedMatchSamples: MatchSample[];
  weakProfileSamples: ProfileSample[];
  profileAccuracyMismatches: AccuracyMismatch[];
}): string {
  const lines: string[] = [];

  lines.push("# 手工抽样评测报告");
  lines.push("");
  lines.push(`生成时间：${input.generatedAt}`);
  lines.push("");
  lines.push("## 1. 样本规模");
  lines.push("");
  lines.push(`- 匹配样本：${input.matchSamples.length} 条`);
  lines.push(`- 画像样本：${input.profileSamples.length} 条`);
  lines.push(`- 总样本：${input.matchSamples.length + input.profileSamples.length} 条`);
  lines.push("");
  lines.push("## 2. 统计口径");
  lines.push("");
  lines.push("- `match_accuracy = is_correct=true 数量 / match 总样本`");
  lines.push("- `profile_accuracy = Σcorrect_fields / Σchecked_fields`");
  lines.push("- 阈值：`match_accuracy >= 0.80` 且 `profile_accuracy >= 0.90`。");
  lines.push("");
  lines.push("## 3. 指标结果");
  lines.push("");
  lines.push(`- match_accuracy：${input.matchAccuracy}（${input.matchPassed ? "通过" : "未通过"}）`);
  lines.push(`- profile_accuracy：${input.profileAccuracy}（${input.profilePassed ? "通过" : "未通过"}）`);
  lines.push(`- 综合判定：${input.overallPassed ? "通过" : "未通过"}`);
  lines.push("");
  lines.push("## 4. 未通过样本清单");
  lines.push("");

  if (input.failedMatchSamples.length === 0) {
    lines.push("### 4.1 匹配样本");
    lines.push("");
    lines.push("- 无");
    lines.push("");
  } else {
    lines.push("### 4.1 匹配样本");
    lines.push("");
    input.failedMatchSamples.forEach((sample) => {
      lines.push(`- ${sample.sample_id}：is_correct=false，备注：${sample.notes}`);
    });
    lines.push("");
  }

  if (input.weakProfileSamples.length === 0) {
    lines.push("### 4.2 画像样本（correct_fields < checked_fields）");
    lines.push("");
    lines.push("- 无");
    lines.push("");
  } else {
    lines.push("### 4.2 画像样本（correct_fields < checked_fields）");
    lines.push("");
    input.weakProfileSamples.forEach((sample) => {
      const measured = toRatio(sample.correct_fields, sample.checked_fields);
      lines.push(
        `- ${sample.sample_id}：correct_fields=${sample.correct_fields} / checked_fields=${sample.checked_fields}（计算 accuracy=${measured}，标注 accuracy=${sample.accuracy}）`,
      );
    });
    lines.push("");
  }

  lines.push("## 5. 标注一致性检查");
  lines.push("");
  if (input.profileAccuracyMismatches.length === 0) {
    lines.push("- 画像样本中 `accuracy` 与 `correct_fields / checked_fields` 一致。\n");
  } else {
    lines.push("- 发现以下样本 `accuracy` 与字段计算值不一致：");
    input.profileAccuracyMismatches.forEach((item) => {
      lines.push(`  - ${item.sample_id}：标注 ${item.provided}，计算 ${item.expected}`);
    });
    lines.push("");
  }

  lines.push("## 6. 数据来源");
  lines.push("");
  lines.push(`- match 文件：${path.relative(resolveRepositoryRoot(), input.options.matchFile)}`);
  lines.push(`- profile 文件：${path.relative(resolveRepositoryRoot(), input.options.profileFile)}`);

  return lines.join("\n");
}

async function main(): Promise<void> {
  const repoRoot = resolveRepositoryRoot();
  const options = parseArgs(repoRoot);

  const matchSamples = readJsonlSamples(options.matchFile, matchSampleSchema);
  const profileSamples = readJsonlSamples(options.profileFile, profileSampleSchema);

  const matchCorrectCount = matchSamples.filter((sample) => sample.is_correct).length;
  const matchAccuracy = toRatio(matchCorrectCount, matchSamples.length);

  const profileCheckedSum = profileSamples.reduce((sum, sample) => sum + sample.checked_fields, 0);
  const profileCorrectSum = profileSamples.reduce((sum, sample) => sum + sample.correct_fields, 0);
  const profileAccuracy = toRatio(profileCorrectSum, profileCheckedSum);

  const matchPassed = matchAccuracy >= PASS_THRESHOLD.matchAccuracy;
  const profilePassed = profileAccuracy >= PASS_THRESHOLD.profileAccuracy;
  const overallPassed = matchPassed && profilePassed;

  const failedMatchSamples = matchSamples.filter((sample) => !sample.is_correct);
  const weakProfileSamples = profileSamples.filter(
    (sample) => sample.correct_fields < sample.checked_fields,
  );

  const profileAccuracyMismatches: AccuracyMismatch[] = profileSamples
    .map((sample) => ({
      sample_id: sample.sample_id,
      expected: toRatio(sample.correct_fields, sample.checked_fields),
      provided: Number(sample.accuracy.toFixed(6)),
    }))
    .filter((item) => Math.abs(item.expected - item.provided) > 0.000001);

  const generatedAt = new Date().toISOString();
  const summary = {
    generated_at: generatedAt,
    thresholds: {
      match_accuracy: PASS_THRESHOLD.matchAccuracy,
      profile_accuracy: PASS_THRESHOLD.profileAccuracy,
    },
    files: {
      match: path.relative(repoRoot, options.matchFile),
      profile: path.relative(repoRoot, options.profileFile),
      report: path.relative(repoRoot, options.reportFile),
    },
    samples: {
      match_total: matchSamples.length,
      profile_total: profileSamples.length,
      total: matchSamples.length + profileSamples.length,
    },
    metrics: {
      match_accuracy: matchAccuracy,
      profile_accuracy: profileAccuracy,
    },
    pass: {
      match: matchPassed,
      profile: profilePassed,
      overall: overallPassed,
    },
    failed_samples: {
      match: failedMatchSamples.map((sample) => sample.sample_id),
      profile: weakProfileSamples.map((sample) => sample.sample_id),
    },
    consistency_warnings: {
      profile_accuracy_mismatch_sample_ids: profileAccuracyMismatches.map((item) => item.sample_id),
    },
  };

  const reportContent = buildMarkdownReport({
    generatedAt,
    options,
    matchSamples,
    profileSamples,
    matchAccuracy,
    profileAccuracy,
    matchPassed,
    profilePassed,
    overallPassed,
    failedMatchSamples,
    weakProfileSamples,
    profileAccuracyMismatches,
  });

  fs.mkdirSync(path.dirname(options.reportFile), { recursive: true });
  fs.writeFileSync(options.reportFile, reportContent, "utf8");

  // eslint-disable-next-line no-console
  console.log("[evaluation:manual]", JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[evaluation:manual] failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
