import type { ManualJobPortraitRecord } from "@career/contracts/types";

export type ManualJobPortraitUpsertInput = Omit<
  ManualJobPortraitRecord,
  "created_at" | "updated_at"
>;

export interface JobPortraitsRepository {
  listManualJobPortraits?(): Promise<ManualJobPortraitRecord[]>;
  getManualJobPortraitByName?(jobName: string): Promise<ManualJobPortraitRecord | null>;
  replaceManualJobPortraits?(input: ManualJobPortraitUpsertInput[]): Promise<void>;
}
