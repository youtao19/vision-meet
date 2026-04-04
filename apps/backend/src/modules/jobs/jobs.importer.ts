import path from "node:path";

import * as XLSX from "xlsx";

import type { JobRecord } from "@career/contracts/types";

export type ImportResult = {
  rows: Omit<JobRecord, "id" | "created_at">[];
  skipped: number;
};

const FIELD_ALIASES: Record<string, string[]> = {
  source_row_id: ["rowid", "row_id", "source_row_id", "序号", "id"],
  title: ["职位名称", "岗位名称", "职位", "job_title", "title", "position", "岗位"],
  location: ["工作地址", "地点", "城市", "location", "city"],
  salary_range: ["薪资范围", "薪资", "工资", "salary", "salary_range"],
  company_name: ["公司全称", "公司名称", "企业名称", "company", "company_name"],
  industry: ["所属行业", "行业", "industry"],
  company_size: ["人员规模", "公司规模", "规模", "company_size"],
  company_type: ["企业性质", "公司性质", "company_type"],
  job_code: ["职位编码", "岗位编码", "job_code"],
  job_description: ["职位描述", "岗位描述", "工作内容", "description", "job_description"],
  company_intro: ["公司简介", "企业简介", "company_intro"],
};

function normalizeKey(key: string): string {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\t]/g, "");
}

function pickValue(source: Record<string, unknown>, aliases: string[]): string | null {
  const normalizedMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(source)) {
    normalizedMap.set(normalizeKey(key), value);
  }

  for (const alias of aliases) {
    const value = normalizedMap.get(normalizeKey(alias));
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();
    if (text && text.toLowerCase() !== "nan") {
      return text;
    }
  }

  return null;
}

function normalizeSourceToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildNormalizedSourceKey(params: {
  sourceRowId: string | null;
  jobCode: string | null;
  title: string;
  location: string | null;
  index: number;
}): string {
  const sourceRowToken = normalizeSourceToken(params.sourceRowId || "");
  if (sourceRowToken && !/^\d+$/.test(sourceRowToken)) {
    return sourceRowToken;
  }

  const jobCodeToken = normalizeSourceToken(params.jobCode || "");
  if (jobCodeToken) {
    return jobCodeToken;
  }

  const titleLocation = [params.title, params.location || "", String(params.index)]
    .map((item) => normalizeSourceToken(item))
    .filter(Boolean)
    .join("|");
  return titleLocation || `job-${params.index}`;
}

function standardizeRow(
  raw: Record<string, unknown>,
  index: number,
): Omit<JobRecord, "id" | "created_at"> | null {
  const sourceRowId = pickValue(raw, FIELD_ALIASES.source_row_id) || String(index);
  const title = pickValue(raw, FIELD_ALIASES.title) || "";
  const location = pickValue(raw, FIELD_ALIASES.location);
  const jobCode = pickValue(raw, FIELD_ALIASES.job_code);
  const row: Omit<JobRecord, "id" | "created_at"> = {
    source_row_id: sourceRowId,
    normalized_source_key: buildNormalizedSourceKey({
      sourceRowId,
      jobCode,
      title,
      location,
      index,
    }),
    title,
    location,
    salary_range: pickValue(raw, FIELD_ALIASES.salary_range),
    company_name: pickValue(raw, FIELD_ALIASES.company_name),
    industry: pickValue(raw, FIELD_ALIASES.industry),
    company_size: pickValue(raw, FIELD_ALIASES.company_size),
    company_type: pickValue(raw, FIELD_ALIASES.company_type),
    job_code: jobCode,
    job_description: pickValue(raw, FIELD_ALIASES.job_description),
    company_intro: pickValue(raw, FIELD_ALIASES.company_intro),
    raw_payload: raw,
  };

  if (!row.title && !row.job_description) {
    return null;
  }

  if (!row.title) {
    row.title = "未命名岗位";
  }

  return row;
}

function parseJsonBuffer(buffer: Buffer, ext: string): Record<string, unknown>[] {
  const text = buffer.toString("utf-8");

  if (ext === ".jsonl") {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  const payload = JSON.parse(text);
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: unknown[] }).data.filter(
      (item) => item && typeof item === "object",
    ) as Record<string, unknown>[];
  }

  throw new Error('JSON 文件格式不正确，预期为对象数组或 {"data": [...]}。');
}

function parseSpreadsheetBuffer(buffer: Buffer, ext: string): Record<string, unknown>[] {
  const workbook =
    ext === ".csv" || ext === ".txt"
      ? XLSX.read(buffer.toString("utf-8"), { type: "string", cellDates: false })
      : ext === ".tsv"
        ? XLSX.read(buffer.toString("utf-8"), { type: "string", FS: "\t", cellDates: false })
        : XLSX.read(buffer, { type: "buffer", cellDates: false });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
    defval: "",
  });
}

export function parseUploadedJobs(file: { originalname: string; buffer: Buffer }): ImportResult {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowed = new Set([".csv", ".tsv", ".txt", ".xls", ".xlsx", ".json", ".jsonl"]);

  if (!allowed.has(ext)) {
    throw new Error("仅支持 .csv/.tsv/.json/.xls/.xlsx 文件。");
  }

  const sourceRows =
    ext === ".json" || ext === ".jsonl"
      ? parseJsonBuffer(file.buffer, ext)
      : parseSpreadsheetBuffer(file.buffer, ext);

  let skipped = 0;
  const rows: Omit<JobRecord, "id" | "created_at">[] = [];

  sourceRows.forEach((raw, idx) => {
    const normalized = standardizeRow(raw, idx + 1);
    if (!normalized) {
      skipped += 1;
      return;
    }
    rows.push(normalized);
  });

  return { rows, skipped };
}
