/**
 * 文件作用：统一装配 Pi 运行时可调用的业务工具。
 * 设计边界：这里只收集工具工厂，不写具体业务逻辑；具体能力仍由各领域 service 承担。
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { createLoadTaskContextTool } from "./context/load-task-context.tool.js";
import { createSearchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";
import { createMatchTool } from "./matching/create-match.tool.js";
import { createCareerReportTool } from "./report/create-career-report.tool.js";
import type { PiToolFactoryContext } from "./pi-tool-context.js";

/**
 * 装配当前 AI 任务主链路工具。
 * 注意：简历生成、学生画像生成、岗位漫画生成已预留独立工具文件，等对应任务入口接入后再纳入此注册表。
 */
export function createCorePiTools(context: PiToolFactoryContext): ToolDefinition[] {
  return [
    createLoadTaskContextTool(context),
    createSearchKnowledgeTool(context),
    createMatchTool(context),
    createCareerReportTool(context),
  ];
}

export { createLoadTaskContextTool } from "./context/load-task-context.tool.js";
export { createSearchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";
export { createMatchTool } from "./matching/create-match.tool.js";
export { createCareerReportTool } from "./report/create-career-report.tool.js";
export { createGenerateJobComicTool } from "./jobs/generate-job-comic.tool.js";
export { createStudentProfileTool } from "./profile/create-student-profile.tool.js";
export { createGenerateResumeHtmlTool } from "./resume/generate-resume-html.tool.js";
export type { PiToolFactoryContext } from "./pi-tool-context.js";
