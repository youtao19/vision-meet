/**
 * 文件作用：把离线清洗后的岗位标准化结果导入 PostgreSQL `job_normalized` 表。
 * 职责边界：本脚本只负责“读取 CSV + 映射字段 + 幂等写入”，不负责清洗规则本身。
 */

import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

import { appEnv } from "../shared/config/env.js";
import { ensureCareerCoreSchema } from "../shared/db/career-schema.js";
import { createAppPgPool } from "../shared/db/postgres.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

type CleanedRow = Record<string, unknown>;

type CliOptions = {
  inputPath: string;
  parseVersion: string;
};

function parseArgs(): CliOptions {
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

  return {
    inputPath: pickArg("--input") || "data/processed/jobs_cleaned.csv",
    parseVersion: pickArg("--parse-version") || "v1",
  };
}

function normalizeKey(input: string): string {
  return input.replace(/\s+/g, "").replace(/[_-]/g, "").toLowerCase();
}

function pickText(row: CleanedRow, aliases: string[]): string | null {
  const normalizedMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalizedMap.set(normalizeKey(key), value);
  }

  for (const alias of aliases) {
    const value = normalizedMap.get(normalizeKey(alias));
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (!text) {
      continue;
    }
    if (text.toLowerCase() === "nan") {
      continue;
    }
    return text;
  }

  return null;
}

function pickNumber(row: CleanedRow, aliases: string[]): number | null {
  const text = pickText(row, aliases);
  if (!text) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function loadRows(absInputPath: string): CleanedRow[] {
  const lowerPath = absInputPath.toLowerCase();
  const workbook =
    lowerPath.endsWith(".csv") || lowerPath.endsWith(".txt")
      ? XLSX.read(fs.readFileSync(absInputPath, "utf8"), {
          type: "string",
          raw: false,
          cellDates: false,
        })
      : XLSX.readFile(absInputPath, {
          raw: false,
          cellDates: false,
        });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<CleanedRow>(workbook.Sheets[firstSheet], {
    defval: "",
  });
}

function createCategoryCodeResolver(
  categories: Array<{ category_code: unknown; category_name: unknown; aliases: unknown }>,
) {
  const map = new Map<string, string>();

  for (const row of categories) {
    const code = String(row.category_code || "").trim();
    if (!code) {
      continue;
    }
    const names = [
      String(row.category_name || "").trim(),
      ...(Array.isArray(row.aliases) ? row.aliases.map((item) => String(item || "").trim()) : []),
    ].filter(Boolean);

    for (const name of names) {
      map.set(name.toLowerCase(), code);
    }
  }

  return (jobFamily: string | null): string | null => {
    if (!jobFamily) {
      return null;
    }
    return map.get(jobFamily.toLowerCase()) || null;
  };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const repoRoot = resolveRepositoryRoot();
  const inputAbsPath = path.resolve(repoRoot, options.inputPath);
  const rows = loadRows(inputAbsPath);

  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    await ensureCareerCoreSchema(pool);
    const client = await pool.connect();
    try {
      const categoryRows = await client.query(
        `
          SELECT category_code, category_name, aliases
          FROM job_categories
        `,
      );
      const resolveCategoryCode = createCategoryCodeResolver(categoryRows.rows);

      await client.query("BEGIN");

      for (const row of rows) {
        const canonicalTitle = pickText(row, ["职位名称", "title", "canonical_title"]);
        const normalizedTitle = pickText(row, ["title_clean", "normalized_title", "职位名称"]);
        const normalizedJobFamily =
          pickText(row, ["normalized_job_family", "岗位族", "job_family"]) || "其他岗位";
        const location = pickText(row, ["工作地址", "location", "city_code"]);
        const dedupKey =
          pickText(row, ["dedup_key"]) ||
          [normalizedTitle || canonicalTitle || "", location || "", normalizedJobFamily]
            .join("|")
            .trim();

        if (!canonicalTitle && !normalizedTitle) {
          skipped += 1;
          continue;
        }

        const finalCanonicalTitle = canonicalTitle || normalizedTitle || "未命名岗位";
        const finalNormalizedTitle = normalizedTitle || canonicalTitle || "未命名岗位";
        const sourceRowId = pickText(row, ["source_row_id", "职位编码", "job_code", "序号", "id"]);
        const sourceJobCode = pickText(row, ["职位编码", "job_code"]);
        const salaryMinK = pickNumber(row, ["salary_min_k"]);
        const salaryMaxK = pickNumber(row, ["salary_max_k"]);
        const confidence = pickNumber(row, ["confidence"]) ?? 0.7;
        const categoryCode = resolveCategoryCode(normalizedJobFamily);
        const payload = {
          source_row_id: sourceRowId,
          source_job_code: sourceJobCode,
          source_location: location,
          source_salary_range: pickText(row, ["薪资范围", "salary_range"]),
          normalized_job_family: normalizedJobFamily,
        };

        const updateResult = await client.query(
          `
            UPDATE job_normalized
            SET
              canonical_title = $3,
              normalized_title = $4,
              normalized_job_family = $5,
              category_code = $6,
              city_code = $7,
              salary_min_k = $8,
              salary_max_k = $9,
              confidence = $10,
              normalized_payload = $11::jsonb,
              updated_at = NOW()
            WHERE dedup_key = $1
              AND parse_version = $2
              OR (
                parse_version = $2
                AND $12::text IS NOT NULL
                AND normalized_payload ->> 'source_job_code' = $12
              )
              OR (
                parse_version = $2
                AND $13::text IS NOT NULL
                AND normalized_payload ->> 'source_row_id' = $13
              )
            RETURNING id
          `,
          [
            dedupKey,
            options.parseVersion,
            finalCanonicalTitle,
            finalNormalizedTitle,
            normalizedJobFamily,
            categoryCode,
            location,
            salaryMinK,
            salaryMaxK,
            confidence,
            JSON.stringify(payload),
            sourceJobCode,
            sourceRowId,
          ],
        );

        if (updateResult.rowCount && updateResult.rowCount > 0) {
          updated += 1;
          continue;
        }

        await client.query(
          `
            INSERT INTO job_normalized (
              canonical_title,
              normalized_title,
              normalized_job_family,
              category_code,
              city_code,
              salary_min_k,
              salary_max_k,
              parse_version,
              confidence,
              dedup_key,
              normalized_payload
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11::jsonb
            )
          `,
          [
            finalCanonicalTitle,
            finalNormalizedTitle,
            normalizedJobFamily,
            categoryCode,
            location,
            salaryMinK,
            salaryMaxK,
            options.parseVersion,
            confidence,
            dedupKey,
            JSON.stringify(payload),
          ],
        );
        inserted += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // eslint-disable-next-line no-console
    console.log(
      "[job-normalized:import]",
      JSON.stringify(
        {
          input: options.inputPath,
          parseVersion: options.parseVersion,
          totalRows: rows.length,
          inserted,
          updated,
          skipped,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[job-normalized:import] failed", error);
  process.exitCode = 1;
});
