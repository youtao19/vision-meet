import type { StructuredApiError } from "@career/contracts/types";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * 文件作用：前端统一 HTTP 调用工具。
 * 关键收益：把结构化错误转换为统一异常，避免各页面重复解析响应体。
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: unknown;
  readonly traceId?: string;

  constructor(status: number, payload?: StructuredApiError) {
    super(payload?.message || `请求失败（${status}）`);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = payload?.code;
    this.detail = payload?.detail;
    this.traceId = payload?.trace_id;
  }
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, apiBaseUrl), init);
  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const structuredError =
      payload && typeof payload === "object" ? (payload as StructuredApiError) : undefined;
    throw new ApiRequestError(response.status, structuredError);
  }

  return payload as T;
}
