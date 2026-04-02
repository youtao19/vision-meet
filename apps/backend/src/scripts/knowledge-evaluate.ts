import type { KnowledgeNamespace } from "@career/contracts/types";

import { appEnv } from "../shared/config/env.js";
import { createKnowledgeServiceFromOptions } from "../modules/knowledge/knowledge.module.js";

/**
 * 文件作用：执行知识检索基线评测并输出结构化结果。
 * 使用方式：默认评测主业务知识库，可通过 `--namespace internal_project_docs` 切换内部文档评测。
 */
function readNamespaceFromArgs(): KnowledgeNamespace {
  const namespaceFlagIndex = process.argv.findIndex((value) => value === "--namespace");
  const raw = namespaceFlagIndex >= 0 ? process.argv[namespaceFlagIndex + 1] : undefined;
  return raw === "internal_project_docs" ? "internal_project_docs" : "career_runtime";
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

  try {
    const response = await service.evaluate({
      namespace: readNamespaceFromArgs(),
      top_k: appEnv.KNOWLEDGE_TOP_K,
    });
    // eslint-disable-next-line no-console
    console.log("[knowledge:eval]", JSON.stringify(response, null, 2));
  } finally {
    await service.dispose();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[knowledge:eval] failed", error);
  process.exitCode = 1;
});
