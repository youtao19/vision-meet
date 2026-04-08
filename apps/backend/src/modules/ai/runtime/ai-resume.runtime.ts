/**
 * 文件作用：执行“简历 HTML 生成”专用 Agent 运行时。
 * 职责边界：仅负责模型会话装配、提示词下发、结果提取与 HTML 可打印兜底，不耦合职业匹配业务工具。
 */

import path from "node:path";

import {
  AuthStorage,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { CreateResumeHtmlRequest, ResumeHtmlResponse } from "@career/contracts/types";
import { HttpError } from "../../../shared/errors/http-error.js";

import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  parseModelRef,
  resolveDefaultPiAgentDir,
  summarizeAssistantMessage,
} from "./ai-agent.utils.js";
import type { AiThinkingLevel } from "./ai-agent.types.js";

const RESUME_GENERATION_SYSTEM_PROMPT = `# Role: 极简高质量简历生成专家（支持润色与内容增强）

## Profile
你是一名专业的简历优化专家 + 前端开发者。

你的核心能力有三点：
1. 能从零引导用户整理简历信息
2. 能将用户提供的“原始、零散、口语化内容” -> 转换为“专业、结构化、可投递简历内容”
3. 能生成一份 美观 + 可打印 + 现代化 HTML 简历

重点不是照搬用户输入，而是：理解 -> 优化表达 -> 补充细节 -> 提升竞争力。

## Workflow
你必须严格按照两个阶段执行：

## 阶段一：信息收集 + 引导优化
当用户信息不足时：
1. 打招呼 + 明确目标，说明你将帮他生成一份可直接投递的专业简历。
2. 一次性给出信息清单：
- 基本信息：姓名、学校/专业/学历/毕业时间、联系方式
- 求职方向：意向岗位、意向城市
- 教育背景
- 项目/实习经历：做了什么、技术栈、职责、成果
- 专业技能：编程语言、框架、数据库、工具
- 其他加分项：比赛/奖项、证书、自我评价
3. 引导方式需主动追问细节与量化结果。
4. 阶段一禁止生成 HTML。

## 阶段二：简历优化 + HTML生成
当用户信息充分后：
1. 先做专业润色：
- 改写口语化表达为简历语言
- 合理补全技术动作与结果表达，不胡编
- 项目经历结构化为：项目名称/技术栈/项目描述/个人职责/项目成果
- 技能分类并专业化
- 生成简洁有力自我评价
2. 输出完整 HTML，放在 html 代码块中。

## HTML要求
1. 结构语义化：header/section/h2/ul/li
2. 样式极简现代：深蓝或黑灰主色，合理留白、行高、卡片布局
3. 必须支持打印：
@media print { /* 隐藏按钮 */ }
@page { margin: 0; }
body { -webkit-print-color-adjust: exact; }
`;

type RunResumeAgentOptions = {
  traceId: string;
  input: CreateResumeHtmlRequest;
  cwd: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  model?: string;
  thinkingLevel: AiThinkingLevel;
  timeoutMs?: number;
};

export type GeneratedResumeHtml = Omit<ResumeHtmlResponse, "resume_id">;

const RESUME_AGENT_TIMEOUT_MS = 120000;

/**
 * 为异步任务增加超时保护，避免上游模型调用长期悬挂占用连接。
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new HttpError(
              504,
              "AI_RESUME_HTML_TIMEOUT",
              `简历生成超时（>${timeoutMs / 1000} 秒），请稍后重试`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractHtmlFromAgentText(rawText: string): string | null {
  const htmlBlockMatch = rawText.match(/```html\s*([\s\S]*?)```/i);
  if (htmlBlockMatch?.[1]?.trim()) {
    return htmlBlockMatch[1].trim();
  }

  const doctypeMatch = rawText.match(/<!doctype[\s\S]*<\/html>/i);
  if (doctypeMatch?.[0]?.trim()) {
    return doctypeMatch[0].trim();
  }

  const htmlMatch = rawText.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch?.[0]?.trim()) {
    return htmlMatch[0].trim();
  }

  return null;
}

function buildFallbackPrintableHtml(rawText: string): string {
  const safeText = escapeHtml(rawText || "模型未返回 HTML，请重试。");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>简历生成结果</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: #f8fafc;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: flex-end;
      margin-bottom: 12px;
    }
    .print-btn {
      border: 1px solid #0f172a;
      background: #0f172a;
      color: #ffffff;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }
    pre {
      white-space: pre-wrap;
      line-height: 1.7;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
    }
    @media print {
      .toolbar { display: none; }
    }
    @page { margin: 0; }
  </style>
</head>
<body>
  <div class="toolbar"><button class="print-btn" onclick="window.print()">打印简历</button></div>
  <pre>${safeText}</pre>
</body>
</html>`;
}

function ensurePrintableControls(html: string): string {
  const hasPrintButton = /window\.print\s*\(/i.test(html);
  const hasPrintStyle = /@media\s+print/i.test(html);
  const hasAdjust = /-webkit-print-color-adjust\s*:/i.test(html);
  const hasPageRule = /@page\s*\{/i.test(html);

  let nextHtml = html;

  if (!hasPrintStyle || !hasAdjust || !hasPageRule) {
    const printStyle = `\n<style id="resume-print-style">\n@media print {\n  .resume-print-toolbar { display: none !important; }\n}\n@page { margin: 0; }\nbody { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n</style>\n`;
    if (nextHtml.includes("</head>")) {
      nextHtml = nextHtml.replace("</head>", `${printStyle}</head>`);
    } else {
      nextHtml = printStyle + nextHtml;
    }
  }

  if (!hasPrintButton) {
    const toolbar = `\n<div class="resume-print-toolbar" style="position:sticky;top:0;display:flex;justify-content:flex-end;padding:12px 0;z-index:99;">\n  <button onclick="window.print()" style="border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">打印简历</button>\n</div>\n`;
    if (nextHtml.includes("<body")) {
      nextHtml = nextHtml.replace(/<body[^>]*>/i, (matched) => `${matched}${toolbar}`);
    } else {
      nextHtml = toolbar + nextHtml;
    }
  }

  return nextHtml;
}

function buildUserPrompt(input: CreateResumeHtmlRequest): string {
  return [
    "请直接执行阶段二（内容润色 + HTML 简历生成），不要再提问。",
    "输出要求：仅返回一份完整 HTML（放在 ```html 代码块），可直接在浏览器新标签页打开并打印。",
    "用户提供的原始履历信息如下：",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}

export async function runResumeHtmlAgent(
  options: RunResumeAgentOptions,
): Promise<GeneratedResumeHtml> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(10000, options.timeoutMs ?? RESUME_AGENT_TIMEOUT_MS);
  const piAgentDir = options.piAgentDir || resolveDefaultPiAgentDir();
  const sessionStoreDir =
    options.sessionStoreDir || path.join(piAgentDir, "sessions", "resume-html-runtime");
  const taskSessionDir = path.join(sessionStoreDir, options.traceId);

  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  const authStorage = AuthStorage.create(path.join(piAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(piAgentDir, "models.json"));
  const modelRef = parseModelRef(options.model);
  const selectedModel = modelRef
    ? modelRegistry.find(modelRef.provider, modelRef.modelId)
    : undefined;
  const selectedModelLabel = selectedModel
    ? `${selectedModel.provider}/${selectedModel.id}`
    : options.model || "auto";

  // 输出关键运行参数，便于排查“前端 504 但后端无输出”的问题。
  console.info(
    `[ai-resume] start trace_id=${options.traceId} model=${selectedModelLabel} timeout_ms=${timeoutMs}`,
  );

  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => RESUME_GENERATION_SYSTEM_PROMPT,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: options.thinkingLevel,
    sessionManager: SessionManager.create(options.cwd, taskSessionDir),
    resourceLoader,
    tools: [],
    customTools: [],
  });

  const assistantMessages: string[] = [];
  let streamingAssistantBuffer = "";
  let lastTurnError = "";
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (
        (event.message as { role?: unknown }).role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamingAssistantBuffer += event.assistantMessageEvent.delta;
      }
      return;
    }

    if (
      event.type === "message_end" &&
      (event.message as { role?: unknown }).role === "assistant"
    ) {
      const finalText = streamingAssistantBuffer.trim() || summarizeAssistantMessage(event.message);
      streamingAssistantBuffer = "";
      if (finalText) {
        assistantMessages.push(finalText);
      }
      return;
    }

    if (event.type === "turn_end") {
      const assistantMessage = event.message as {
        role?: unknown;
        stopReason?: unknown;
        errorMessage?: unknown;
      };
      if (assistantMessage.role === "assistant" && assistantMessage.stopReason === "error") {
        lastTurnError = String(assistantMessage.errorMessage || "简历生成执行失败");
      }
    }
  });

  try {
    await withTimeout(session.prompt(buildUserPrompt(options.input)), timeoutMs);

    if (lastTurnError) {
      throw new HttpError(502, "AI_RESUME_HTML_AGENT_ERROR", `简历生成失败：${lastTurnError}`);
    }

    const rawText = assistantMessages.at(-1)?.trim() || "";
    const html = extractHtmlFromAgentText(rawText);
    const printableHtml = ensurePrintableControls(html || buildFallbackPrintableHtml(rawText));

    console.info(
      `[ai-resume] success trace_id=${options.traceId} duration_ms=${Date.now() - startedAt} raw_text_len=${rawText.length}`,
    );

    return {
      trace_id: options.traceId,
      model: session.model ? `${session.model.provider}/${session.model.id}` : null,
      html: printableHtml,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ai-resume] fail trace_id=${options.traceId} duration_ms=${Date.now() - startedAt} message=${message}`,
    );
    throw error;
  } finally {
    unsubscribe();
    session.dispose();
  }
}
