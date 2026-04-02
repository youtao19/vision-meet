import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import type {
  CreateStudentProfileFromResumeRequest,
  KnowledgeEvaluationCaseResult,
  KnowledgeEvaluationRequest,
  KnowledgeEvaluationResponse,
  KnowledgeIndexItem,
  KnowledgeIndexRequest,
  KnowledgeIndexResponse,
  KnowledgeNamespace,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeSearchResultItem,
  KnowledgeSourceKind,
  StudentProfileRecord,
} from "@career/contracts/types";

import { HttpError } from "../../shared/errors/http-error.js";
import { buildSha256Digest } from "../../shared/utils/match-fingerprint.js";
import { resolveRepositoryRoot } from "../../shared/utils/repository-root.js";
import { parseUploadedJobs } from "../jobs/jobs.importer.js";
import type {
  KnowledgeChunkCreateInput,
  KnowledgeDocumentIndexInput,
  KnowledgeRepository,
} from "./knowledge.repository.js";

/**
 * 文件作用：承载知识库领域的索引、检索、评测和简历同步入库逻辑。
 * 设计边界：service 负责文本解析、切分和融合排序；repository 只负责落库和召回。
 */

type SourceDocument = {
  source_id: string;
  title: string;
  content_text: string;
  source_path: string | null;
  section_path: string | null;
  job_id: number | null;
  profile_id: number | null;
};

type EvaluationCase = {
  query: string;
  expected_terms: string[];
  source_kinds?: KnowledgeSourceKind[];
};

export interface KnowledgeService {
  prepareInfrastructure(): Promise<void>;
  index(input: KnowledgeIndexRequest): Promise<KnowledgeIndexResponse>;
  search(input: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse>;
  evaluate(input: KnowledgeEvaluationRequest): Promise<KnowledgeEvaluationResponse>;
  indexResumeProfile(params: {
    profile: StudentProfileRecord;
    resumeInput: CreateStudentProfileFromResumeRequest;
  }): Promise<void>;
  dispose(): Promise<void>;
}

type KnowledgeServiceOptions = {
  vectorDim: number;
  defaultTopK: number;
  reindexBatchSize: number;
  repoRoot?: string;
};

const MAX_CHUNK_CHARS = 700;

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function tokenizeText(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function buildEmbeddingVector(text: string, dimension: number): number[] {
  const tokens = tokenizeText(text);
  const vector = new Array<number>(dimension).fill(0);

  if (tokens.length === 0) {
    return vector;
  }

  tokens.forEach((token) => {
    const digest = createHash("sha256").update(token).digest();
    const primaryIndex = digest[0] % dimension;
    const secondaryIndex = digest[1] % dimension;
    const primarySign = digest[2] % 2 === 0 ? 1 : -1;
    const secondarySign = digest[3] % 2 === 0 ? 1 : -1;
    vector[primaryIndex] += primarySign;
    vector[secondaryIndex] += secondarySign * 0.5;
  });

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

function estimateTokenCount(text: string): number {
  return tokenizeText(text).length;
}

function chunkPlainText(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [normalized];
  }

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= MAX_CHUNK_CHARS) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += MAX_CHUNK_CHARS) {
      chunks.push(paragraph.slice(index, index + MAX_CHUNK_CHARS));
    }
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function parseMarkdownSections(
  markdown: string,
): Array<{ sectionPath: string | null; content: string }> {
  const lines = normalizeText(markdown).split("\n");
  const sections: Array<{ sectionPath: string | null; content: string }> = [];
  const headingStack: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      return;
    }
    sections.push({
      sectionPath: headingStack.length > 0 ? headingStack.join(" / ") : null,
      content,
    });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      const level = match[1].length;
      headingStack.splice(level - 1);
      headingStack[level - 1] = match[2].trim();
      continue;
    }
    buffer.push(line);
  }

  flush();
  return sections.length > 0 ? sections : [{ sectionPath: null, content: normalizeText(markdown) }];
}

function buildJobDocumentContent(row: Record<string, unknown>): string {
  const fields = [
    `岗位名称：${row.title || ""}`,
    row.company_name ? `公司名称：${row.company_name}` : "",
    row.location ? `工作地点：${row.location}` : "",
    row.salary_range ? `薪资范围：${row.salary_range}` : "",
    row.industry ? `所属行业：${row.industry}` : "",
    row.company_size ? `公司规模：${row.company_size}` : "",
    row.company_type ? `企业性质：${row.company_type}` : "",
    row.job_description ? `岗位描述：${row.job_description}` : "",
    row.company_intro ? `公司简介：${row.company_intro}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return normalizeText(fields);
}

function normalizeNamespace(
  sourceKind: KnowledgeSourceKind,
  namespace?: KnowledgeNamespace,
): KnowledgeNamespace {
  if (sourceKind === "project_doc") {
    if (namespace && namespace !== "internal_project_docs") {
      throw new HttpError(
        400,
        "KNOWLEDGE_NAMESPACE_INVALID",
        "项目文档只能写入 internal_project_docs",
      );
    }
    return "internal_project_docs";
  }

  if (namespace === "internal_project_docs") {
    throw new HttpError(
      400,
      "KNOWLEDGE_NAMESPACE_INVALID",
      "业务知识不能写入 internal_project_docs",
    );
  }

  return namespace ?? "career_runtime";
}

function scoreContainsExpectedTerm(chunkText: string, expectedTerms: string[]): boolean {
  const lowered = chunkText.toLowerCase();
  return expectedTerms.some((term) => lowered.includes(term.toLowerCase()));
}

function resolveInputPath(repoRoot: string, sourcePath: string): string {
  const resolved = path.resolve(repoRoot, sourcePath);
  if (!resolved.startsWith(repoRoot)) {
    throw new HttpError(400, "KNOWLEDGE_SOURCE_PATH_INVALID", "source_path 必须位于仓库目录内");
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new HttpError(400, "KNOWLEDGE_SOURCE_PATH_INVALID", `文件不存在：${sourcePath}`);
  }
  return resolved;
}

function buildKeywordAndVectorScore(
  result: KnowledgeSearchResultItem,
  maxKeyword: number,
  maxVector: number,
) {
  const keywordNorm = maxKeyword > 0 ? result.keyword_score / maxKeyword : 0;
  const vectorNorm = maxVector > 0 ? result.vector_score / maxVector : 0;
  return Number((keywordNorm * 0.45 + vectorNorm * 0.55).toFixed(6));
}

export function createKnowledgeService(
  repository: KnowledgeRepository,
  options: KnowledgeServiceOptions,
): KnowledgeService {
  const repoRoot = options.repoRoot ?? resolveRepositoryRoot();

  async function prepareInfrastructure(): Promise<void> {
    await repository.prepareInfrastructure();
  }

  async function loadSourceDocuments(
    namespace: KnowledgeNamespace,
    sourceKind: KnowledgeSourceKind,
    item: KnowledgeIndexItem,
  ): Promise<SourceDocument[]> {
    if (sourceKind === "resume_text") {
      const text = item.text?.trim();
      if (!text) {
        throw new HttpError(400, "KNOWLEDGE_INDEX_INVALID", "resume_text 必须提供 text");
      }
      const sourceId =
        item.source_id ||
        (item.profile_id ? `profile:${item.profile_id}` : `resume:${buildSha256Digest(text)}`);
      return [
        {
          source_id: sourceId,
          title: item.title?.trim() || "学生简历",
          content_text: normalizeText(text),
          source_path: item.source_path?.trim() || null,
          section_path: item.section_path ?? null,
          job_id: item.job_id ?? null,
          profile_id: item.profile_id ?? null,
        },
      ];
    }

    if (!item.source_path) {
      throw new HttpError(400, "KNOWLEDGE_INDEX_INVALID", "文件类知识源必须提供 source_path");
    }

    const absolutePath = resolveInputPath(repoRoot, item.source_path);
    const relativePath = path.relative(repoRoot, absolutePath);

    if (sourceKind === "job_dataset") {
      const parsed = parseUploadedJobs({
        originalname: path.basename(absolutePath),
        buffer: fs.readFileSync(absolutePath),
      });

      return parsed.rows.map((row, index) => {
        const sourceId = `${relativePath}:${row.source_row_id || index + 1}`;
        return {
          source_id: sourceId,
          title: row.title,
          content_text: buildJobDocumentContent(row),
          source_path: relativePath,
          section_path: null,
          job_id: null,
          profile_id: null,
        };
      });
    }

    const markdown = fs.readFileSync(absolutePath, "utf-8");
    const sections = parseMarkdownSections(markdown);
    return sections.map((section, index) => ({
      source_id: `${relativePath}:${index + 1}`,
      title: section.sectionPath
        ? `${path.basename(relativePath)} - ${section.sectionPath}`
        : path.basename(relativePath),
      content_text: section.content,
      source_path: relativePath,
      section_path: section.sectionPath,
      job_id: null,
      profile_id: null,
    }));
  }

  function buildChunks(text: string): KnowledgeChunkCreateInput[] {
    return chunkPlainText(text).map((chunkText, index) => ({
      chunk_index: index,
      chunk_text: chunkText,
      token_count: estimateTokenCount(chunkText),
      embedding: buildEmbeddingVector(chunkText, options.vectorDim),
    }));
  }

  async function index(input: KnowledgeIndexRequest): Promise<KnowledgeIndexResponse> {
    const namespace = normalizeNamespace(input.source_kind, input.namespace);
    await repository.prepareInfrastructure();

    let indexedDocuments = 0;
    let indexedChunks = 0;
    let skippedDocuments = 0;

    for (
      let indexOffset = 0;
      indexOffset < input.items.length;
      indexOffset += options.reindexBatchSize
    ) {
      const batch = input.items.slice(indexOffset, indexOffset + options.reindexBatchSize);

      for (const item of batch) {
        const documents = await loadSourceDocuments(namespace, input.source_kind, item);

        for (const document of documents) {
          const contentDigest = buildSha256Digest({
            namespace,
            source_kind: input.source_kind,
            source_id: document.source_id,
            content_text: document.content_text,
            source_path: document.source_path,
            section_path: document.section_path,
            job_id: document.job_id,
            profile_id: document.profile_id,
          });

          const documentInput: KnowledgeDocumentIndexInput = {
            namespace,
            source_kind: input.source_kind,
            source_id: document.source_id,
            title: document.title,
            content_text: document.content_text,
            source_path: document.source_path,
            section_path: document.section_path,
            job_id: document.job_id,
            profile_id: document.profile_id,
            content_digest: contentDigest,
            force_reindex: input.force_reindex ?? false,
            chunks: buildChunks(document.content_text),
          };

          const result = await repository.indexDocument(documentInput);
          if (result.action === "skipped") {
            skippedDocuments += 1;
            continue;
          }
          indexedDocuments += 1;
          indexedChunks += result.chunk_count;
        }
      }
    }

    return {
      namespace,
      source_kind: input.source_kind,
      indexed_documents: indexedDocuments,
      indexed_chunks: indexedChunks,
      skipped_documents: skippedDocuments,
    };
  }

  async function search(input: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const namespace = input.namespace ?? "career_runtime";
    const limit = input.limit ?? options.defaultTopK;
    const queryEmbedding = buildEmbeddingVector(input.query, options.vectorDim);
    const candidateLimit = Math.max(limit * 4, 10);
    const params = {
      namespace,
      source_kinds: input.source_kinds,
      student_profile_id: input.student_profile_id,
      query: input.query,
      embedding: queryEmbedding,
      limit: candidateLimit,
    };

    const [keywordCandidates, vectorCandidates] = await Promise.all([
      repository.searchByKeyword(params),
      repository.searchByVector(params),
    ]);

    const merged = new Map<number, KnowledgeSearchResultItem>();
    keywordCandidates.forEach((candidate) => {
      merged.set(candidate.id, candidate);
    });
    vectorCandidates.forEach((candidate) => {
      const existing = merged.get(candidate.id);
      if (existing) {
        existing.vector_score = candidate.vector_score;
      } else {
        merged.set(candidate.id, candidate);
      }
    });

    const candidates = [...merged.values()];
    const maxKeyword = Math.max(0, ...candidates.map((item) => item.keyword_score));
    const maxVector = Math.max(0, ...candidates.map((item) => item.vector_score));
    candidates.forEach((candidate) => {
      candidate.final_score = buildKeywordAndVectorScore(candidate, maxKeyword, maxVector);
    });

    candidates.sort((a, b) => b.final_score - a.final_score || a.id - b.id);

    return {
      total: Math.min(candidates.length, limit),
      items: candidates.slice(0, limit),
    };
  }

  async function evaluate(input: KnowledgeEvaluationRequest): Promise<KnowledgeEvaluationResponse> {
    const namespace = input.namespace ?? "career_runtime";
    const topK = input.top_k ?? options.defaultTopK;
    const cases: EvaluationCase[] =
      namespace === "internal_project_docs"
        ? [
            {
              query: "项目要求使用什么数据库和向量检索方案",
              expected_terms: ["postgresql", "pgvector"],
              source_kinds: ["project_doc"],
            },
            {
              query: "大赛对人岗匹配准确率有什么要求",
              expected_terms: ["80%", "90%"],
              source_kinds: ["project_doc"],
            },
          ]
        : [
            {
              query: "前端开发岗位通常需要哪些技能",
              expected_terms: ["vue", "typescript", "react"],
              source_kinds: ["job_dataset"],
            },
            {
              query: "岗位描述里常见的后端技术要求有哪些",
              expected_terms: ["node", "java", "sql"],
              source_kinds: ["job_dataset"],
            },
          ];

    const results: KnowledgeEvaluationCaseResult[] = [];

    for (const testCase of cases) {
      const response = await search({
        query: testCase.query,
        namespace,
        source_kinds: testCase.source_kinds,
        limit: topK,
      });

      let reciprocalRank = 0;
      const matchedChunkIds: number[] = [];
      response.items.forEach((item, index) => {
        if (scoreContainsExpectedTerm(item.chunk_text, testCase.expected_terms)) {
          matchedChunkIds.push(item.id);
          if (reciprocalRank === 0) {
            reciprocalRank = 1 / (index + 1);
          }
        }
      });

      results.push({
        query: testCase.query,
        expected_terms: testCase.expected_terms,
        hit: matchedChunkIds.length > 0,
        reciprocal_rank: Number(reciprocalRank.toFixed(6)),
        matched_chunk_ids: matchedChunkIds,
      });
    }

    const hitCount = results.filter((item) => item.hit).length;
    const mrr =
      results.length > 0
        ? Number(
            (results.reduce((sum, item) => sum + item.reciprocal_rank, 0) / results.length).toFixed(
              6,
            ),
          )
        : 0;

    return {
      namespace,
      top_k: topK,
      recall_at_k: results.length > 0 ? Number((hitCount / results.length).toFixed(6)) : 0,
      mrr,
      cases: results,
    };
  }

  async function indexResumeProfile(params: {
    profile: StudentProfileRecord;
    resumeInput: CreateStudentProfileFromResumeRequest;
  }): Promise<void> {
    await index({
      namespace: "career_runtime",
      source_kind: "resume_text",
      force_reindex: true,
      items: [
        {
          source_id: `profile:${params.profile.id}`,
          source_path: params.resumeInput.file_name,
          title: `${params.profile.name} - ${params.profile.target_role} 简历`,
          text: params.resumeInput.file_content,
          profile_id: params.profile.id,
        },
      ],
    });
  }

  async function dispose(): Promise<void> {
    await repository.dispose();
  }

  return {
    prepareInfrastructure,
    index,
    search,
    evaluate,
    indexResumeProfile,
    dispose,
  };
}
