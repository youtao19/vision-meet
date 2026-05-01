import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { appEnv } from "../shared/config/env.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

/**
 * 文件作用：导出 PostgreSQL/pgvector 中的知识库资料，生成比赛提交可用的数据包。
 * 职责边界：脚本只读取 knowledge_documents / knowledge_chunks，不修改数据库；默认排除学生简历文本，避免外部提交时泄露个人信息。
 */

type ExportOptions = {
  outputDir: string;
  includeResumeText: boolean;
};

type KnowledgeDocumentExportRow = {
  id: number;
  namespace: string;
  source_kind: string;
  source_id: string;
  title: string;
  content_text: string;
  content_digest: string;
  source_path: string | null;
  section_path: string | null;
  job_id: number | null;
  profile_id: number | null;
  created_at: string;
  updated_at: string;
};

type KnowledgeChunkExportRow = {
  id: number;
  document_id: number;
  namespace: string;
  source_kind: string;
  source_id: string;
  title: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  embedding: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type KnowledgeCountRow = {
  namespace: string;
  source_kind: string;
  documents: number;
  chunks: number;
};

function buildTimestamp(): string {
  const now = new Date();
  const localParts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(" ", "T")
    .replaceAll(":", "-");

  return localParts;
}

function parseArgs(argv: string[], repoRoot: string): ExportOptions {
  let outputDir = path.join(repoRoot, "data", "exports", `knowledge-base-${buildTimestamp()}`);
  let includeResumeText = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--include-resume-text") {
      includeResumeText = true;
      continue;
    }

    if (arg === "--output-dir") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--output-dir 需要提供导出目录");
      }
      outputDir = path.resolve(repoRoot, nextValue);
      index += 1;
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  return { outputDir, includeResumeText };
}

function buildSourceKindFilter(includeResumeText: boolean): {
  whereSql: string;
  values: unknown[];
} {
  if (includeResumeText) {
    return { whereSql: "", values: [] };
  }

  return {
    whereSql: "WHERE d.source_kind <> $1",
    values: ["resume_text"],
  };
}

function toJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  const repoRoot = resolveRepositoryRoot();
  const options = parseArgs(process.argv.slice(2), repoRoot);
  const exportDir = options.outputDir;

  fs.mkdirSync(exportDir, { recursive: true });

  const pool = new Pool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });

  try {
    const filter = buildSourceKindFilter(options.includeResumeText);

    const documentsResult = await pool.query<KnowledgeDocumentExportRow>(
      `
        SELECT
          d.id::int AS id,
          d.namespace,
          d.source_kind,
          d.source_id,
          d.title,
          d.content_text,
          d.content_digest,
          d.source_path,
          d.section_path,
          d.job_id,
          d.profile_id,
          d.created_at::text AS created_at,
          d.updated_at::text AS updated_at
        FROM knowledge_documents d
        ${filter.whereSql}
        ORDER BY d.namespace, d.source_kind, d.source_id, d.id
      `,
      filter.values,
    );

    const chunksResult = await pool.query<KnowledgeChunkExportRow>(
      `
        SELECT
          c.id::int AS id,
          c.document_id::int AS document_id,
          d.namespace,
          d.source_kind,
          d.source_id,
          d.title,
          c.chunk_index,
          c.chunk_text,
          c.token_count,
          c.embedding::text AS embedding,
          c.metadata,
          c.created_at::text AS created_at,
          c.updated_at::text AS updated_at
        FROM knowledge_chunks c
        INNER JOIN knowledge_documents d ON d.id = c.document_id
        ${filter.whereSql}
        ORDER BY d.namespace, d.source_kind, d.source_id, c.chunk_index, c.id
      `,
      filter.values,
    );

    const countsResult = await pool.query<KnowledgeCountRow>(
      `
        SELECT
          d.namespace,
          d.source_kind,
          COUNT(DISTINCT d.id)::int AS documents,
          COUNT(c.id)::int AS chunks
        FROM knowledge_documents d
        LEFT JOIN knowledge_chunks c ON c.document_id = d.id
        ${filter.whereSql}
        GROUP BY d.namespace, d.source_kind
        ORDER BY d.namespace, d.source_kind
      `,
      filter.values,
    );

    const documentsPath = path.join(exportDir, "knowledge_documents.json");
    const chunksPath = path.join(exportDir, "knowledge_chunks.jsonl");
    const manifestPath = path.join(exportDir, "manifest.json");
    const readmePath = path.join(exportDir, "README.md");

    writeJsonFile(documentsPath, documentsResult.rows);
    fs.writeFileSync(chunksPath, chunksResult.rows.map(toJsonLine).join(""), "utf-8");

    const manifest = {
      exported_at: new Date().toISOString(),
      export_timezone: "Asia/Shanghai",
      database: {
        host: appEnv.PGHOST,
        port: appEnv.PGPORT,
        database: appEnv.PGDATABASE,
        user: appEnv.PGUSER,
      },
      filters: {
        include_resume_text: options.includeResumeText,
        excluded_source_kinds: options.includeResumeText ? [] : ["resume_text"],
      },
      totals: {
        documents: documentsResult.rowCount,
        chunks: chunksResult.rowCount,
      },
      by_namespace_source_kind: countsResult.rows,
      files: [
        {
          path: "knowledge_documents.json",
          description: "知识库文档级数据，包含原文、来源路径、命名空间和内容摘要。",
        },
        {
          path: "knowledge_chunks.jsonl",
          description:
            "知识库分块级数据，每行一个 chunk，包含检索文本、token 数、metadata 和 pgvector 向量文本。",
        },
      ],
    };
    writeJsonFile(manifestPath, manifest);

    fs.writeFileSync(
      readmePath,
      [
        "# Career Agent 知识库数据导出",
        "",
        "本目录由 `npm run knowledge:export` 生成，用于比赛提交或离线验收。",
        "",
        "## 文件说明",
        "",
        "1. `knowledge_documents.json`：文档级知识数据，保留 `namespace/source_kind/source_id/title/content_text/source_path/section_path/content_digest` 等字段。",
        "2. `knowledge_chunks.jsonl`：检索分块数据，每行一个 JSON 对象，保留 chunk 文本、token 数、metadata 与 pgvector 向量。",
        "3. `manifest.json`：导出时间、过滤条件、数据量统计和文件清单。",
        "",
        "## 提交口径",
        "",
        options.includeResumeText
          ? "- 本次导出包含 `resume_text`，其中可能含学生简历文本；对外提交前请确认已脱敏或允许提交。"
          : "- 本次导出默认排除了 `resume_text`，避免把学生简历文本提交到外部。若确需全量导出，请执行 `npm run knowledge:export -- --include-resume-text`。",
        "- `career_runtime/job_dataset` 是主业务知识库，来自岗位数据集。",
        "- `internal_project_docs/project_doc` 是内部项目文档知识库，用于调试、评测和答辩材料说明。",
        "",
      ].join("\n"),
      "utf-8",
    );

    // eslint-disable-next-line no-console
    console.log(
      "[knowledge:export]",
      JSON.stringify(
        {
          exportDir,
          documents: documentsResult.rowCount,
          chunks: chunksResult.rowCount,
          by_namespace_source_kind: countsResult.rows,
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
  console.error("[knowledge:export] failed", error);
  process.exitCode = 1;
});
