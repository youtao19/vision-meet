import type {
  CreateResumeHtmlRequest,
  ResumeHtmlListResponse,
  ResumeHtmlRecord,
} from "@career/contracts/types";

export type ResumeHtmlRecordCreateInput = {
  trace_id: string;
  model: string | null;
  basic_name: string;
  target_position: string;
  summary: string | null;
  input_payload: CreateResumeHtmlRequest;
  html: string;
};

export type ResumeHtmlListQuery = {
  offset: number;
  limit: number;
};

export interface ResumeRepository {
  createResumeHtmlRecord(input: ResumeHtmlRecordCreateInput): Promise<ResumeHtmlRecord>;
  listResumeHtmlRecords(query: ResumeHtmlListQuery): Promise<ResumeHtmlListResponse>;
  getResumeHtmlRecordById(resumeId: number): Promise<ResumeHtmlRecord | null>;
}
