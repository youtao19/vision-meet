/**
 * 文件作用：将用户提供的岗位画像数据写入 PostgreSQL，供图谱与匹配展示直接消费。
 * 使用方式：npm run job-portraits:seed -w career-backend
 */

import { MANUAL_JOB_PORTRAITS_SEED } from "../modules/job-portraits/manual-job-portraits.seed.js";
import { createPgJobPortraitsRepository } from "../modules/job-portraits/job-portraits.repository.pg.js";
import { appEnv } from "../shared/config/env.js";
import { createAppPgPool } from "../shared/db/postgres.js";

async function main(): Promise<void> {
  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });
  const repository = createPgJobPortraitsRepository(pool);

  try {
    if (typeof repository.replaceManualJobPortraits !== "function") {
      throw new Error("当前仓储未实现 replaceManualJobPortraits");
    }
    await repository.replaceManualJobPortraits(MANUAL_JOB_PORTRAITS_SEED);
    console.log(`[job-portraits:seed] seeded=${MANUAL_JOB_PORTRAITS_SEED.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[job-portraits:seed] failed", error);
  process.exitCode = 1;
});
