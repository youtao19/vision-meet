import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeEvaluationRequest,
  KnowledgeEvaluationResponse,
  KnowledgeNamespace,
} from "@career/contracts/types";

import { createKnowledgeServiceFromOptions } from "../modules/knowledge/knowledge.module.js";
import { appEnv } from "../shared/config/env.js";

/**
 * 文件作用：一键执行知识检索基线评测并持久化结果快照。
 * 职责边界：仅负责组织评测执行与结果落盘，不承载检索算法逻辑。
 * 依赖关系：复用 knowledge service 的 evaluate 能力，输出到仓库 data/evaluation/knowledge 目录。
 */

type BaselineSnapshot = {
  generated_at: string;
  top_k: number;
  results: KnowledgeEvaluationResponse[];
};

/**
 * 解析命令行 top-k 参数。
 * 参数含义：`--top-k <number>`，用于覆盖默认评测 TopK。
 * 返回值：合法正整数时返回该值，否则回退到环境默认值。
 * 注意点：非法值不会中断流程，以保证脚本在 CI/本地都可稳定执行。
 */
function readTopKFromArgs(defaultTopK: number): number {
  const topKFlagIndex = process.argv.findIndex((value) => value === "--top-k");
  if (topKFlagIndex < 0) {
    return defaultTopK;
  }

  const rawTopK = process.argv[topKFlagIndex + 1];
  const parsed = Number(rawTopK);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultTopK;
  }
  return parsed;
}

/**
 * 解析输出目录参数。
 * 参数含义：`--out-dir <path>`，支持相对路径；未传则使用默认目录。
 * 返回值：绝对路径，便于后续统一写文件。
 * 注意点：相对路径一律按仓库根目录解析，避免工作目录不同导致结果漂移。
 */
function readOutputDirectoryFromArgs(defaultDirectory: string): string {
  const outDirFlagIndex = process.argv.findIndex((value) => value === "--out-dir");
  if (outDirFlagIndex < 0) {
    return defaultDirectory;
  }

  const rawPath = process.argv[outDirFlagIndex + 1];
  if (!rawPath) {
    return defaultDirectory;
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(defaultDirectory, "..", "..", "..", rawPath);
}

/**
 * 构建本次基线快照文件名。
 * 返回值：带时间戳的文件名，示例 `baseline-2026-04-04T10-30-00-000Z.json`。
 * 注意点：将 `:` 替换为 `-`，避免在不同系统中出现路径兼容问题。
 */
function buildSnapshotFileName(now: Date): string {
  const safeTimestamp = now.toISOString().replace(/[:.]/g, "-");
  return `baseline-${safeTimestamp}.json`;
}

async function main(): Promise<void> {
  const service = createKnowledgeServiceFromOptions({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
    vectorDim: appEnv.PGVECTOR_DIM,
    defaultTopK: appEnv.KNOWLEDGE_TOP_K,
    reindexBatchSize: appEnv.KNOWLEDGE_REINDEX_BATCH_SIZE,
  });

  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const defaultOutputDirectory = path.resolve(repoRoot, "data", "evaluation", "knowledge");
  const outputDirectory = readOutputDirectoryFromArgs(defaultOutputDirectory);
  const topK = readTopKFromArgs(appEnv.KNOWLEDGE_TOP_K);
  const namespaces: KnowledgeNamespace[] = ["career_runtime", "internal_project_docs"];

  try {
    const results: KnowledgeEvaluationResponse[] = [];

    for (const namespace of namespaces) {
      const payload: KnowledgeEvaluationRequest = { namespace, top_k: topK };
      // 分 namespace 顺序执行，保证同一批数据下的结果可稳定复现。
      const response = await service.evaluate(payload);
      results.push(response);
    }

    const snapshot: BaselineSnapshot = {
      generated_at: new Date().toISOString(),
      top_k: topK,
      results,
    };

    await mkdir(outputDirectory, { recursive: true });
    const latestFilePath = path.resolve(outputDirectory, "latest.json");
    const snapshotFilePath = path.resolve(
      outputDirectory,
      buildSnapshotFileName(new Date(snapshot.generated_at)),
    );

    const output = `${JSON.stringify(snapshot, null, 2)}\n`;
    await writeFile(latestFilePath, output, "utf-8");
    await writeFile(snapshotFilePath, output, "utf-8");

    // eslint-disable-next-line no-console
    console.log(
      "[knowledge:baseline]",
      JSON.stringify(
        {
          top_k: topK,
          latest: latestFilePath,
          snapshot: snapshotFilePath,
          summary: results.map((item) => ({
            namespace: item.namespace,
            recall_at_k: item.recall_at_k,
            mrr: item.mrr,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await service.dispose();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[knowledge:baseline] failed", error);
  process.exitCode = 1;
});
