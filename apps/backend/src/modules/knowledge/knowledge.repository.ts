/**
 * 文件作用：定义知识库领域的数据访问抽象与 PostgreSQL + pgvector 实现。
 * 依赖边界：service 只依赖该接口和 createKnowledgeRepository 工厂。
 */

import { Pool, type PoolClient } from "pg";

import type {
  KnowledgeDocumentRecord,
  KnowledgeNamespace,
  KnowledgeSearchResultItem,
  KnowledgeSourceKind,
} from "@career/contracts/types";

export type KnowledgeChunkCreateInput = {
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  embedding: number[];
};

export type KnowledgeDocumentIndexInput = {
  namespace: KnowledgeNamespace;
  source_kind: KnowledgeSourceKind;
  source_id: string;
  title: string;
  content_text: string;
  source_path: string | null;
  section_path: string | null;
  job_id: number | null;
  profile_id: number | null;
  content_digest: string;
  force_reindex: boolean;
  chunks: KnowledgeChunkCreateInput[];
};

export type KnowledgeDocumentIndexResult = {
  action: "indexed" | "skipped";
  document: KnowledgeDocumentRecord;
  chunk_count: number;
};

export type KnowledgeSearchParams = {
  namespace: KnowledgeNamespace;
  source_kinds?: KnowledgeSourceKind[];
  student_profile_id?: number;
  query: string;
  embedding: number[];
  limit: number;
};

export interface KnowledgeRepository {
  prepareInfrastructure(): Promise<void>;
  indexDocument(input: KnowledgeDocumentIndexInput): Promise<KnowledgeDocumentIndexResult>;
  searchByKeyword(params: KnowledgeSearchParams): Promise<KnowledgeSearchResultItem[]>;
  searchByVector(params: KnowledgeSearchParams): Promise<KnowledgeSearchResultItem[]>;
  dispose(): Promise<void>;
}

type PgKnowledgeRepositoryOptions = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  vectorDim: number;
};

type SearchFilterContext = {
  values: unknown[];
  nextIndex: number;
};

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

function mapDocumentRecord(row: Record<string, unknown>): KnowledgeDocumentRecord {
  return {
    id: Number(row.id),
    namespace: row.namespace as KnowledgeNamespace,
    source_kind: row.source_kind as KnowledgeSourceKind,
    source_id: String(row.source_id),
    title: String(row.title),
    source_path: (row.source_path as string | null) ?? null,
    section_path: (row.section_path as string | null) ?? null,
    job_id: row.job_id === null ? null : Number(row.job_id),
    profile_id: row.profile_id === null ? null : Number(row.profile_id),
    content_digest: String(row.content_digest),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapSearchResult(
  row: Record<string, unknown>,
  scoreField: "keyword_score" | "vector_score",
) {
  const keywordScore = scoreField === "keyword_score" ? Number(row.keyword_score) : 0;
  const vectorScore = scoreField === "vector_score" ? Number(row.vector_score) : 0;

  const mapped: KnowledgeSearchResultItem = {
    id: Number(row.id),
    document_id: Number(row.document_id),
    namespace: row.namespace as KnowledgeNamespace,
    source_kind: row.source_kind as KnowledgeSourceKind,
    source_id: String(row.source_id),
    title: String(row.title),
    chunk_index: Number(row.chunk_index),
    chunk_text: String(row.chunk_text),
    source_path: (row.source_path as string | null) ?? null,
    section_path: (row.section_path as string | null) ?? null,
    job_id: row.job_id === null ? null : Number(row.job_id),
    profile_id: row.profile_id === null ? null : Number(row.profile_id),
    keyword_score: Number.isFinite(keywordScore) ? keywordScore : 0,
    vector_score: Number.isFinite(vectorScore) ? vectorScore : 0,
    final_score: 0,
  };

  return mapped;
}

function applySearchFilters(
  baseSql: string,
  params: KnowledgeSearchParams,
): SearchFilterContext & { sql: string } {
  let sql = `${baseSql} WHERE d.namespace = $1`;
  const values: unknown[] = [params.namespace];
  let nextIndex = 2;

  if (params.source_kinds && params.source_kinds.length > 0) {
    sql += ` AND d.source_kind = ANY($${nextIndex}::text[])`;
    values.push(params.source_kinds);
    nextIndex += 1;
  }

  if (params.student_profile_id !== undefined) {
    sql += ` AND (d.profile_id IS NULL OR d.profile_id = $${nextIndex})`;
    values.push(params.student_profile_id);
    nextIndex += 1;
  }

  return { sql, values, nextIndex };
}

export function createKnowledgeRepository(
  options: PgKnowledgeRepositoryOptions,
): KnowledgeRepository {
  const pool = new Pool({
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password,
  });

  let schemaReady: Promise<void> | null = null;

  async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await handler(client);
    } finally {
      client.release();
    }
  }

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("CREATE EXTENSION IF NOT EXISTS vector");
          await client.query(`
            CREATE TABLE IF NOT EXISTS knowledge_documents (
              id BIGSERIAL PRIMARY KEY,
              namespace TEXT NOT NULL,
              source_kind TEXT NOT NULL,
              source_id TEXT NOT NULL,
              title TEXT NOT NULL,
              content_text TEXT NOT NULL,
              content_digest TEXT NOT NULL,
              source_path TEXT,
              section_path TEXT,
              job_id INTEGER,
              profile_id INTEGER,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(namespace, source_kind, source_id)
            )
          `);
          await client.query(`
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
              id BIGSERIAL PRIMARY KEY,
              document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
              chunk_index INTEGER NOT NULL,
              chunk_text TEXT NOT NULL,
              token_count INTEGER NOT NULL,
              embedding VECTOR(${options.vectorDim}) NOT NULL,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(chunk_text, ''))) STORED,
              UNIQUE(document_id, chunk_index)
            )
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS knowledge_documents_lookup_idx
            ON knowledge_documents (namespace, source_kind, profile_id, job_id)
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS knowledge_chunks_tsv_idx
            ON knowledge_chunks USING GIN (tsv)
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
            ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 20)
          `);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    }

    return schemaReady;
  }

  async function indexDocument(
    input: KnowledgeDocumentIndexInput,
  ): Promise<KnowledgeDocumentIndexResult> {
    await ensureSchema();

    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await client.query(
          `
            SELECT *
            FROM knowledge_documents
            WHERE namespace = $1 AND source_kind = $2 AND source_id = $3
            LIMIT 1
          `,
          [input.namespace, input.source_kind, input.source_id],
        );

        if (
          existing.rowCount &&
          existing.rows[0].content_digest === input.content_digest &&
          !input.force_reindex
        ) {
          await client.query("COMMIT");
          return {
            action: "skipped",
            document: mapDocumentRecord(existing.rows[0]),
            chunk_count: 0,
          };
        }

        const documentRow =
          existing.rowCount && existing.rows[0]
            ? (
                await client.query(
                  `
                    UPDATE knowledge_documents
                    SET
                      title = $4,
                      content_text = $5,
                      content_digest = $6,
                      source_path = $7,
                      section_path = $8,
                      job_id = $9,
                      profile_id = $10,
                      updated_at = NOW()
                    WHERE namespace = $1 AND source_kind = $2 AND source_id = $3
                    RETURNING *
                  `,
                  [
                    input.namespace,
                    input.source_kind,
                    input.source_id,
                    input.title,
                    input.content_text,
                    input.content_digest,
                    input.source_path,
                    input.section_path,
                    input.job_id,
                    input.profile_id,
                  ],
                )
              ).rows[0]
            : (
                await client.query(
                  `
                    INSERT INTO knowledge_documents (
                      namespace,
                      source_kind,
                      source_id,
                      title,
                      content_text,
                      content_digest,
                      source_path,
                      section_path,
                      job_id,
                      profile_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING *
                  `,
                  [
                    input.namespace,
                    input.source_kind,
                    input.source_id,
                    input.title,
                    input.content_text,
                    input.content_digest,
                    input.source_path,
                    input.section_path,
                    input.job_id,
                    input.profile_id,
                  ],
                )
              ).rows[0];

        await client.query("DELETE FROM knowledge_chunks WHERE document_id = $1", [documentRow.id]);

        for (const chunk of input.chunks) {
          await client.query(
            `
              INSERT INTO knowledge_chunks (document_id, chunk_index, chunk_text, token_count, embedding)
              VALUES ($1, $2, $3, $4, $5::vector)
            `,
            [
              documentRow.id,
              chunk.chunk_index,
              chunk.chunk_text,
              chunk.token_count,
              toVectorLiteral(chunk.embedding),
            ],
          );
        }

        await client.query("COMMIT");
        return {
          action: "indexed",
          document: mapDocumentRecord(documentRow),
          chunk_count: input.chunks.length,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async function searchByKeyword(
    params: KnowledgeSearchParams,
  ): Promise<KnowledgeSearchResultItem[]> {
    await ensureSchema();
    const filtered = applySearchFilters(
      `
        SELECT
          c.id,
          c.document_id,
          c.chunk_index,
          c.chunk_text,
          d.namespace,
          d.source_kind,
          d.source_id,
          d.title,
          d.source_path,
          d.section_path,
          d.job_id,
          d.profile_id,
          ts_rank_cd(c.tsv, plainto_tsquery('simple', $QUERY$)) AS keyword_score
        FROM knowledge_chunks c
        INNER JOIN knowledge_documents d ON d.id = c.document_id
      `,
      params,
    );

    const queryPlaceholder = `$${filtered.nextIndex}`;
    const limitPlaceholder = `$${filtered.nextIndex + 1}`;
    const sql = `
      ${filtered.sql.replace("$QUERY$", queryPlaceholder)}
      AND c.tsv @@ plainto_tsquery('simple', ${queryPlaceholder})
      ORDER BY keyword_score DESC, c.id ASC
      LIMIT ${limitPlaceholder}
    `;
    const result = await pool.query(sql, [...filtered.values, params.query, params.limit]);
    return result.rows.map((row: Record<string, unknown>) => mapSearchResult(row, "keyword_score"));
  }

  async function searchByVector(
    params: KnowledgeSearchParams,
  ): Promise<KnowledgeSearchResultItem[]> {
    await ensureSchema();
    const filtered = applySearchFilters(
      `
        SELECT
          c.id,
          c.document_id,
          c.chunk_index,
          c.chunk_text,
          d.namespace,
          d.source_kind,
          d.source_id,
          d.title,
          d.source_path,
          d.section_path,
          d.job_id,
          d.profile_id,
          1 - (c.embedding <=> $VECTOR$::vector) AS vector_score
        FROM knowledge_chunks c
        INNER JOIN knowledge_documents d ON d.id = c.document_id
      `,
      params,
    );

    const vectorPlaceholder = `$${filtered.nextIndex}`;
    const limitPlaceholder = `$${filtered.nextIndex + 1}`;
    const sql = `
      ${filtered.sql.replace("$VECTOR$", vectorPlaceholder)}
      ORDER BY c.embedding <=> ${vectorPlaceholder}::vector ASC, c.id ASC
      LIMIT ${limitPlaceholder}
    `;
    const result = await pool.query(sql, [
      ...filtered.values,
      toVectorLiteral(params.embedding),
      params.limit,
    ]);
    return result.rows.map((row: Record<string, unknown>) => mapSearchResult(row, "vector_score"));
  }

  async function dispose(): Promise<void> {
    await pool.end();
  }

  return {
    prepareInfrastructure: ensureSchema,
    indexDocument,
    searchByKeyword,
    searchByVector,
    dispose,
  };
}
