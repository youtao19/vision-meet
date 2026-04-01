/**
 * 文件作用：定义统一的 HTTP 业务异常。
 * 职责边界：service/route 通过该异常表达可预期错误，最终由 app.ts 统一转换为结构化响应。
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
