import fs from "node:fs";
import path from "node:path";

import type { AgentRepository, AgentRunCreateInput, AgentRunRecord } from "./agent.repository.js";

type AgentRunStoreData = {
  counter: number;
  items: AgentRunRecord[];
};

/**
 * 文件作用：提供 agent 编排审计日志的 JSON 存储适配器。
 * 使用场景：MVP 先记录本地运行轨迹，便于演示和排障，后续可迁移到数据库或日志平台。
 */
export function createJsonAgentRepository(storagePath?: string): AgentRepository {
  const storageFile = storagePath || path.join(process.cwd(), "storage", "agent-runs.json");

  function ensureStore(): void {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
      const initial: AgentRunStoreData = {
        counter: 0,
        items: [],
      };
      fs.writeFileSync(storageFile, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  function readStore(): AgentRunStoreData {
    ensureStore();
    const raw = fs.readFileSync(storageFile, "utf-8");
    return JSON.parse(raw) as AgentRunStoreData;
  }

  function writeStore(data: AgentRunStoreData): void {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), "utf-8");
  }

  function createRun(input: AgentRunCreateInput): AgentRunRecord {
    const store = readStore();
    store.counter += 1;

    const record: AgentRunRecord = {
      ...input,
      id: store.counter,
      created_at: new Date().toISOString(),
    };

    store.items.push(record);
    writeStore(store);
    return record;
  }

  return {
    createRun,
  };
}
