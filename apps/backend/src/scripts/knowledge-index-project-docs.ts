import fs from "node:fs";
import path from "node:path";

import { appEnv } from "../shared/config/env.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";
import { createKnowledgeServiceFromOptions } from "../modules/knowledge/knowledge.module.js";

/**
 * 文件作用：批量索引项目文档到内部知识命名空间。
 * 使用边界：该脚本只服务内部调试和评测，不会影响默认用户检索结果。
 */
async function main(): Promise<void> {
  const repoRoot = resolveRepositoryRoot();
  const docsDir = path.join(repoRoot, "docs");
  const sourcePaths = fs
    .readdirSync(docsDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
    .map((entry) => ({ source_path: `docs/${entry}` }));

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

  try {
    const response = await service.index({
      namespace: "internal_project_docs",
      source_kind: "project_doc",
      force_reindex: process.argv.includes("--force"),
      items: sourcePaths,
    });
    // eslint-disable-next-line no-console
    console.log("[knowledge:index:project-docs]", JSON.stringify(response, null, 2));
  } finally {
    await service.dispose();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[knowledge:index:project-docs] failed", error);
  process.exitCode = 1;
});
