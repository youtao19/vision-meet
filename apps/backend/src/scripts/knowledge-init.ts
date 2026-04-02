import { appEnv } from "../shared/config/env.js";
import { createKnowledgeServiceFromOptions } from "../modules/knowledge/knowledge.module.js";

/**
 * 文件作用：初始化知识库所需的 PostgreSQL/pgvector 表结构。
 * 使用场景：首次启动数据库或需要手动补建知识表时执行。
 */
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
    await service.prepareInfrastructure();
    // eslint-disable-next-line no-console
    console.log("[knowledge:init] knowledge schema is ready");
  } finally {
    await service.dispose();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[knowledge:init] failed", error);
  process.exitCode = 1;
});
