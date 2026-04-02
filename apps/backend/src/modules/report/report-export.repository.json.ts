import fs from "node:fs";
import path from "node:path";

import type {
  CareerReportExportRecord,
  ReportExportListResponse,
} from "@career/contracts/types";

import type {
  CareerReportExportCreateInput,
  ReportExportRepository,
} from "./report-export.repository.js";

type ReportExportStoreData = {
  counter: number;
  items: CareerReportExportRecord[];
};

/**
 * 文件作用：提供报告导出记录的 JSON 存储适配器。
 * 使用场景：当前阶段用于导出产物追踪，后续可平滑迁移到数据库。
 */
export function createJsonReportExportRepository(storagePath?: string): ReportExportRepository {
  const storageFile = storagePath || path.join(process.cwd(), "storage", "report-exports.json");

  function ensureStore(): void {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
      const initial: ReportExportStoreData = {
        counter: 0,
        items: [],
      };
      fs.writeFileSync(storageFile, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  function readStore(): ReportExportStoreData {
    ensureStore();
    const raw = fs.readFileSync(storageFile, "utf-8");
    return JSON.parse(raw) as ReportExportStoreData;
  }

  function writeStore(data: ReportExportStoreData): void {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), "utf-8");
  }

  function reserveNextExportId(): number {
    const store = readStore();
    return store.counter + 1;
  }

  function createExportRecord(input: CareerReportExportCreateInput): CareerReportExportRecord {
    const store = readStore();
    store.counter = Math.max(store.counter + 1, input.id);

    const record: CareerReportExportRecord = {
      ...input,
      id: input.id,
      created_at: new Date().toISOString(),
    };

    store.items.push(record);
    writeStore(store);
    return record;
  }

  function listExportRecordsByReportId(reportId: number): ReportExportListResponse {
    const store = readStore();
    const items = store.items
      .filter((item) => item.report_id === reportId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return {
      total: items.length,
      items,
    };
  }

  function getExportRecordById(exportId: number): CareerReportExportRecord | null {
    const store = readStore();
    return store.items.find((item) => item.id === exportId) || null;
  }

  return {
    reserveNextExportId,
    createExportRecord,
    listExportRecordsByReportId,
    getExportRecordById,
  };
}
