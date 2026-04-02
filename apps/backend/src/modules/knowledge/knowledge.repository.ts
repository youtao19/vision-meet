import type {
  KnowledgeDocumentRecord,
  KnowledgeNamespace,
  KnowledgeSearchResultItem,
  KnowledgeSourceKind,
} from "@career/contracts/types";

/**
 * 文件作用：定义知识库领域的数据访问抽象。
 * 依赖边界：service 只依赖该接口，不直接依赖 PostgreSQL/pgvector 细节。
 */

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
