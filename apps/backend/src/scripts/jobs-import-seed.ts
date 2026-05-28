import fs from "node:fs";
import path from "node:path";

import { createJobsRepository } from "../modules/jobs/jobs.repository.js";
import { createJobsService } from "../modules/jobs/jobs.service.js";
import { appEnv } from "../shared/config/env.js";
import { createAppPgPool } from "../shared/db/postgres.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

async function main(): Promise<void> {
  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });
  const repository = createJobsRepository(pool);
  const service = createJobsService(repository);

  try {
    const existing = await service.listJobs({ offset: 0, limit: 1 });
    if (existing.total > 0) {
      console.log(`[jobs:import-seed] skipped existing_total=${existing.total}`);
      return;
    }

    const repoRoot = resolveRepositoryRoot();
    const sourcePath = path.join(repoRoot, "data", "岗位数据.xls");
    const response = await service.importJobs({
      originalname: path.basename(sourcePath),
      buffer: fs.readFileSync(sourcePath),
    });
    console.log(`[jobs:import-seed] ${response.message}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[jobs:import-seed] failed", error);
  process.exitCode = 1;
});
