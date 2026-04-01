import fs from "node:fs";
import path from "node:path";

import type {
  MatchListParams,
  MatchResultDetail,
  MatchResultListResponse,
  MatchResultSummary,
} from "@career/contracts/types";

import type {
  MatchResultCreateInput,
  MatchResultUniqueKey,
  MatchingRepository,
} from "./matching.repository.js";

type MatchStoreData = {
  counter: number;
  items: MatchResultDetail[];
};

function toSummary(record: MatchResultDetail): MatchResultSummary {
  return {
    id: record.id,
    student_profile_id: record.student_profile_id,
    job_id: record.job_id,
    job_profile_version: record.job_profile_version,
    scoring_version: record.scoring_version,
    input_fingerprint: record.input_fingerprint,
    from_cache: record.from_cache,
    total_score: record.total_score,
    dimension_scores: record.dimension_scores,
    created_at: record.created_at,
  };
}

export function createJsonMatchingRepository(storagePath?: string): MatchingRepository {
  const storageFile = storagePath || path.join(process.cwd(), "storage", "matches.json");

  function ensureStore(): void {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
      const initial: MatchStoreData = {
        counter: 0,
        items: [],
      };
      fs.writeFileSync(storageFile, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  function readStore(): MatchStoreData {
    ensureStore();
    const raw = fs.readFileSync(storageFile, "utf-8");
    return JSON.parse(raw) as MatchStoreData;
  }

  function writeStore(data: MatchStoreData): void {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), "utf-8");
  }

  function createMatchResult(input: MatchResultCreateInput): MatchResultDetail {
    const store = readStore();
    store.counter += 1;

    const record: MatchResultDetail = {
      ...input,
      id: store.counter,
      from_cache: input.from_cache ?? false,
      created_at: new Date().toISOString(),
    };

    store.items.push(record);
    writeStore(store);

    return record;
  }

  function getMatchResultById(matchId: number): MatchResultDetail | null {
    const store = readStore();
    return store.items.find((item) => item.id === matchId) || null;
  }

  function listMatchResults(params: MatchListParams): MatchResultListResponse {
    const store = readStore();
    let items = [...store.items];

    if (params.student_profile_id !== undefined) {
      items = items.filter((item) => item.student_profile_id === params.student_profile_id);
    }

    if (params.job_id !== undefined) {
      items = items.filter((item) => item.job_id === params.job_id);
    }

    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return {
      total: items.length,
      items: items.slice(params.offset, params.offset + params.limit).map(toSummary),
    };
  }

  function findReusableResult(uniqueKey: MatchResultUniqueKey): MatchResultDetail | null {
    const store = readStore();
    const matched = store.items.find((item) => {
      return (
        item.student_profile_id === uniqueKey.student_profile_id &&
        item.job_id === uniqueKey.job_id &&
        item.job_profile_version === uniqueKey.job_profile_version &&
        item.scoring_version === uniqueKey.scoring_version &&
        item.input_fingerprint === uniqueKey.input_fingerprint
      );
    });

    return matched || null;
  }

  return {
    createMatchResult,
    getMatchResultById,
    listMatchResults,
    findReusableResult,
  };
}
