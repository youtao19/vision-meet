import fs from "node:fs";
import path from "node:path";

import type {
  CareerReportRecord,
  CareerReportSection,
  ReportListParams,
  ReportListResponse,
} from "@career/contracts/types";

import type { CareerReportCreateInput, ReportRepository } from "./report.repository.js";

type ReportStoreData = {
  counter: number;
  items: CareerReportRecord[];
};

function toSummary(record: CareerReportRecord) {
  return {
    id: record.id,
    match_id: record.match_id,
    version: record.version,
    student_profile_id: record.student_profile_id,
    job_id: record.job_id,
    total_score: record.total_score,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

/**
 * 文件作用：提供 report 领域的 JSON 存储适配器。
 * 使用场景：本地联调与演示阶段先落到文件存储，后续可替换为数据库实现。
 */
export function createJsonReportRepository(storagePath?: string): ReportRepository {
  const storageFile = storagePath || path.join(process.cwd(), "storage", "reports.json");

  function ensureStore(): void {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
      const initial: ReportStoreData = {
        counter: 0,
        items: [],
      };
      fs.writeFileSync(storageFile, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  function readStore(): ReportStoreData {
    ensureStore();
    const raw = fs.readFileSync(storageFile, "utf-8");
    return JSON.parse(raw) as ReportStoreData;
  }

  function writeStore(data: ReportStoreData): void {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), "utf-8");
  }

  function createReport(input: CareerReportCreateInput): CareerReportRecord {
    const store = readStore();
    store.counter += 1;

    const now = new Date().toISOString();
    const record: CareerReportRecord = {
      ...input,
      id: store.counter,
      created_at: now,
      updated_at: now,
    };

    store.items.push(record);
    writeStore(store);

    return record;
  }

  function listReports(params: ReportListParams): ReportListResponse {
    const store = readStore();
    const items = store.items
      .filter((item) => item.match_id === params.match_id)
      .sort((a, b) => b.version - a.version)
      .map(toSummary);

    return {
      total: items.length,
      items,
    };
  }

  function getReportById(reportId: number): CareerReportRecord | null {
    const store = readStore();
    return store.items.find((item) => item.id === reportId) || null;
  }

  function updateReport(reportId: number, sections: CareerReportSection[]): CareerReportRecord | null {
    const store = readStore();
    const index = store.items.findIndex((item) => item.id === reportId);
    if (index < 0) {
      return null;
    }

    const updated: CareerReportRecord = {
      ...store.items[index],
      sections,
      updated_at: new Date().toISOString(),
    };

    store.items[index] = updated;
    writeStore(store);
    return updated;
  }

  return {
    createReport,
    listReports,
    getReportById,
    updateReport,
  };
}
