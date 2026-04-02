CREATE EXTENSION IF NOT EXISTS vector;

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
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding VECTOR(32) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(chunk_text, ''))) STORED,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_documents_lookup_idx
ON knowledge_documents (namespace, source_kind, profile_id, job_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_tsv_idx
ON knowledge_chunks USING GIN (tsv);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 20);
