# Career Agent 知识库数据导出

本目录由 `npm run knowledge:export` 生成，用于比赛提交或离线验收。

## 文件说明

1. `knowledge_documents.json`：文档级知识数据，保留 `namespace/source_kind/source_id/title/content_text/source_path/section_path/content_digest` 等字段。
2. `knowledge_chunks.jsonl`：检索分块数据，每行一个 JSON 对象，保留 chunk 文本、token 数、metadata 与 pgvector 向量。
3. `manifest.json`：导出时间、过滤条件、数据量统计和文件清单。

## 提交口径

- 本次导出默认排除了 `resume_text`，避免把学生简历文本提交到外部。若确需全量导出，请执行 `npm run knowledge:export -- --include-resume-text`。
- `career_runtime/job_dataset` 是主业务知识库，来自岗位数据集。
- `internal_project_docs/project_doc` 是内部项目文档知识库，用于调试、评测和答辩材料说明。
