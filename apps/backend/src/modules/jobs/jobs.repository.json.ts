import fs from "node:fs";
import path from "node:path";

import type {
  JobProfileRecord,
  JobRecord,
  JobsListParams,
  JobsListResponse,
} from "@career/contracts/types";

import type { JobProfileCreateInput, JobsRepository, JobCreateInput } from "./jobs.repository.js";

type StoreData = {
  counters: {
    job: number;
    profile: number;
  };
  jobs: JobRecord[];
  profiles: JobProfileRecord[];
};

export function createJsonJobsRepository(storagePath?: string): JobsRepository {
  const storageFile = storagePath || path.join(process.cwd(), "storage", "data.json");

  function ensureStore(): void {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
      const initial: StoreData = {
        counters: { job: 0, profile: 0 },
        jobs: [],
        profiles: [],
      };
      fs.writeFileSync(storageFile, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  function readStore(): StoreData {
    ensureStore();
    const raw = fs.readFileSync(storageFile, "utf-8");
    return JSON.parse(raw) as StoreData;
  }

  function writeStore(data: StoreData): void {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), "utf-8");
  }

  function addJobs(rows: JobCreateInput[]): { imported: number; insertedJobs: JobRecord[] } {
    const store = readStore();
    const insertedJobs: JobRecord[] = [];

    for (const row of rows) {
      store.counters.job += 1;
      const record: JobRecord = {
        ...row,
        id: store.counters.job,
        created_at: new Date().toISOString(),
      };
      store.jobs.push(record);
      insertedJobs.push(record);
    }

    writeStore(store);
    return { imported: insertedJobs.length, insertedJobs };
  }

  function listJobs(params: JobsListParams): JobsListResponse {
    const store = readStore();
    let items = [...store.jobs];

    if (params.keyword) {
      const key = params.keyword.toLowerCase();
      items = items.filter((job) => {
        const fields = [job.title, job.job_description, job.company_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return fields.includes(key);
      });
    }

    if (params.industry) {
      items = items.filter((job) => job.industry === params.industry);
    }

    items.sort((a, b) => b.id - a.id);

    return {
      total: items.length,
      items: items.slice(params.offset, params.offset + params.limit),
    };
  }

  function getJobById(jobId: number): JobRecord | null {
    const store = readStore();
    return store.jobs.find((job) => job.id === jobId) || null;
  }

  function getLatestProfileByJobId(jobId: number): JobProfileRecord | null {
    const store = readStore();
    const matched = store.profiles
      .filter((profile) => profile.job_id === jobId)
      .sort((a, b) => b.profile_version - a.profile_version);

    return matched[0] || null;
  }

  function createJobProfile(profile: JobProfileCreateInput): JobProfileRecord {
    const store = readStore();
    store.counters.profile += 1;

    const record: JobProfileRecord = {
      ...profile,
      id: store.counters.profile,
      created_at: new Date().toISOString(),
    };

    store.profiles.push(record);
    writeStore(store);

    return record;
  }

  return {
    addJobs,
    listJobs,
    getJobById,
    getLatestProfileByJobId,
    createJobProfile,
    getStorePath: () => {
      ensureStore();
      return storageFile;
    },
  };
}
