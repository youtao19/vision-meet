/**
 * 文件作用：统一装配 Pi 运行时可调用的业务工具。
 * 设计边界：这里只收集工具工厂，不写具体业务逻辑；具体能力仍由各领域 service 承担。
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { createLoadTaskContextTool } from "./context/load-task-context.tool.js";
import { createSearchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";
import { createMatchTool } from "./matching/create-match.tool.js";
import { createCareerReportTool } from "./report/create-career-report.tool.js";
import { createGenerateJobComicTool } from "./jobs/generate-job-comic.tool.js";
import type { PiToolFactoryContext } from "./pi-tool-context.js";

/**
 * 装配当前 AI 任务主链路工具。
 * 注意：简历生成、学生画像生成仍保留独立任务入口；岗位漫画已纳入主链路，由 Pi 自行决定是否调用。
 */
export function createCorePiTools(context: PiToolFactoryContext): ToolDefinition[] {
  const tools = [
    createLoadTaskContextTool(context),
    createSearchKnowledgeTool(context),
    createMatchTool(context),
    createCareerReportTool(context),
  ];
  if (context.dependencies.jobComicsService) {
    tools.push(
      createGenerateJobComicTool({
        jobComicsService: context.dependencies.jobComicsService,
      }),
    );
  }
  return tools;
}

export { createLoadTaskContextTool } from "./context/load-task-context.tool.js";
export { createSearchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";
export { createMatchTool } from "./matching/create-match.tool.js";
export { createCareerReportTool } from "./report/create-career-report.tool.js";
export { createGenerateJobComicTool } from "./jobs/generate-job-comic.tool.js";
export { createStudentProfileTool } from "./profile/create-student-profile.tool.js";
export { createGenerateResumeHtmlTool } from "./resume/generate-resume-html.tool.js";
export type { PiToolFactoryContext } from "./pi-tool-context.js";
