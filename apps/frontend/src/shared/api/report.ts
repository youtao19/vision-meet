import type {
  CareerReportExportRecord,
  CareerReportRecord,
  CreateReportExportRequest,
  CreateReportRequest,
  ReportExportListResponse,
  ReportListResponse,
  UpdateReportRequest,
} from "@career/contracts/types";

import { apiBaseUrl, requestJson } from "./http";

export async function createReport(payload: CreateReportRequest): Promise<CareerReportRecord> {
  return requestJson<CareerReportRecord>("/api/v2/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchReportList(matchId: number): Promise<ReportListResponse> {
  return requestJson<ReportListResponse>(`/api/v2/reports?match_id=${matchId}`);
}

export async function fetchReportDetail(reportId: number): Promise<CareerReportRecord> {
  return requestJson<CareerReportRecord>(`/api/v2/reports/${reportId}`);
}

export async function updateReport(
  reportId: number,
  payload: UpdateReportRequest,
): Promise<CareerReportRecord> {
  return requestJson<CareerReportRecord>(`/api/v2/reports/${reportId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function createReportExport(
  reportId: number,
  payload: CreateReportExportRequest,
): Promise<CareerReportExportRecord> {
  return requestJson<CareerReportExportRecord>(`/api/v2/reports/${reportId}/exports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchReportExports(reportId: number): Promise<ReportExportListResponse> {
  return requestJson<ReportExportListResponse>(`/api/v2/reports/${reportId}/exports`);
}

export function resolveReportExportDownloadUrl(downloadPath: string): string {
  return new URL(downloadPath, apiBaseUrl).toString();
}
