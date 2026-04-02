import { appEnv } from "../shared/config/env.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";
import { createKnowledgeServiceFromOptions } from "../modules/knowledge/knowledge.module.js";

/**
 * 文件作用：批量索引岗位数据文件到主业务知识库。
 * 约束说明：只索引 `career_runtime` 命名空间，不把项目文档混入用户检索池。
 */
async function main(): Promise<void> {
  const repoRoot = resolveRepositoryRoot();
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
  const forceReindex = process.argv.includes("--force");

  try {
    const response = await service.index({
      namespace: "career_runtime",
      source_kind: "job_dataset",
      force_reindex: forceReindex,
      items: [{ source_path: "data/jobs_sample.csv" }, { source_path: "data/岗位数据.xls" }],
    });
    // eslint-disable-next-line no-console
    console.log("[knowledge:index:jobs]", JSON.stringify({ repoRoot, response }, null, 2));
  } finally {
    await service.dispose();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[knowledge:index:jobs] failed", error);
  process.exitCode = 1;
});
