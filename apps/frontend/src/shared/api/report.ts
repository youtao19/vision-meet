import type {
  CareerReportRecord,
  CreateReportRequest,
  ReportListResponse,
  UpdateReportRequest,
} from "@career/contracts/types";

import { requestJson } from "./http";

export async function createReport(payload: CreateReportRequest): Promise<CareerReportRecord> {
  return requestJson<CareerReportRecord>("/api/v1/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchReportList(matchId: number): Promise<ReportListResponse> {
  return requestJson<ReportListResponse>(`/api/v1/reports?match_id=${matchId}`);
}

export async function fetchReportDetail(reportId: number): Promise<CareerReportRecord> {
  return requestJson<CareerReportRecord>(`/api/v1/reports/${reportId}`);
}

export async function updateReport(
  reportId: number,
  payload: UpdateReportRequest,
): Promise<CareerReportRecord> {
  return requestJson<CareerReportRecord>(`/api/v1/reports/${reportId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
