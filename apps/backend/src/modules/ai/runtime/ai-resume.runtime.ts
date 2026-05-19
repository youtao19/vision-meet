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

const RESUME_GENERATION_SYSTEM_PROMPT = `# Role: 简历 HTML 生成专家

你只负责把用户已经提交的结构化履历信息生成一份可投递、可打印的中文 HTML 简历。

要求：
1. 直接生成结果，不要追问、不要解释、不要输出 Markdown 正文。
2. 只在用户提供事实基础上润色表达，可以让措辞更专业，但不得编造学校、公司、奖项、技术栈或量化结果。
3. 输出必须是完整 HTML，并放在 \`\`\`html 代码块中。
4. HTML 使用语义化结构：header、section、h2、ul、li。
5. 优先把项目/实习经历写成“背景 - 技术栈 - 个人职责 - 难点 - 成果”的结构。
6. 技能要分类，不要堆关键词；证书、奖项、作品链接必须独立成块。
7. 样式极简现代，主色使用深蓝或黑灰，适合 A4 打印。
8. 必须包含打印支持：@media print、@page、-webkit-print-color-adjust。
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

const RESUME_AGENT_TIMEOUT_MS = 60000;

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

function splitMultilineText(value: string): string[] {
  return value
    .split(/\r?\n|[；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildHtmlList(items: string[]): string {
  if (items.length === 0) {
    return "<li>暂无补充信息</li>";
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
}

function buildOptionalBlock(title: string, value: string | undefined): string {
  const items = splitMultilineText(value || "");
  if (items.length === 0) {
    return "";
  }

  return `
      <section class="block">
        <h2>${escapeHtml(title)}</h2>
        <ul>${buildHtmlList(items)}</ul>
      </section>`;
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

/**
 * 在 Agent 超时或外部模型不可用时生成本地简历。
 * 注意点：兜底模板只做排版与轻量结构化，不编造经历；这样可以保证接口可用，同时保留后续重新调用 AI 优化的空间。
 */
export function buildLocalResumeHtml(input: CreateResumeHtmlRequest): string {
  const summary =
    input.summary?.trim() ||
    `求职方向为${input.basic.target_position}，具备相关学习与实践经历，能够围绕岗位要求持续补齐项目能力。`;
  const skills = splitMultilineText(input.skills);
  const targetCity = input.basic.target_city?.trim();
  const educations = input.educations
    .map(
      (item) => `
      <section class="item">
        <div class="item-head">
          <strong>${escapeHtml(item.school)}</strong>
          <span>${escapeHtml(item.period)}</span>
        </div>
        <p>${escapeHtml(item.degree)} · ${escapeHtml(item.major)}</p>
        ${item.gpa ? `<p class="muted">成绩/排名：${escapeHtml(item.gpa)}</p>` : ""}
        ${item.core_courses ? `<p class="muted">核心课程：${escapeHtml(item.core_courses)}</p>` : ""}
        ${item.honors ? `<p class="muted">在校荣誉：${escapeHtml(item.honors)}</p>` : ""}
      </section>`,
    )
    .join("\n");
  const experiences = input.experiences
    .map((item) => {
      const responsibilities = splitMultilineText(item.responsibilities);
      const achievements = splitMultilineText(item.achievements);
      const difficulties = splitMultilineText(item.difficulties || "");
      const typeLabelMap: Record<
        NonNullable<CreateResumeHtmlRequest["experiences"][number]["type"]>,
        string
      > = {
        project: "项目经历",
        internship: "实习经历",
        competition: "竞赛经历",
        campus: "校园经历",
      };
      const typeLabel = item.type ? typeLabelMap[item.type] : "项目 / 实习经历";

      return `
      <section class="item">
        <div class="item-head">
          <strong>${escapeHtml(item.organization)} · ${escapeHtml(item.role)}</strong>
          <span>${escapeHtml(item.period)}</span>
        </div>
        <p class="muted">${escapeHtml(typeLabel)}</p>
        ${item.background ? `<p>${escapeHtml(item.background)}</p>` : ""}
        ${item.tech_stack ? `<p class="muted">技术栈：${escapeHtml(item.tech_stack)}</p>` : ""}
        <h3>主要职责</h3>
        <ul>${buildHtmlList(responsibilities)}</ul>
        ${difficulties.length > 0 ? `<h3>关键难点</h3><ul>${buildHtmlList(difficulties)}</ul>` : ""}
        <h3>项目成果</h3>
        <ul>${buildHtmlList(achievements)}</ul>
      </section>`;
    })
    .join("\n");
  const certificatesBlock = buildOptionalBlock("证书", input.certificates);
  const awardsBlock = buildOptionalBlock("奖项 / 竞赛", input.awards);
  const portfolioBlock = buildOptionalBlock("作品链接", input.portfolio_links);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.basic.name)} - ${escapeHtml(input.basic.target_position)}简历</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
      color: #111827;
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .resume-print-toolbar {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: flex-end;
      padding: 12px 24px;
      background: rgba(238, 242, 247, 0.92);
      z-index: 10;
    }
    .resume-print-toolbar button {
      border: 1px solid #0f172a;
      background: #0f172a;
      color: #ffffff;
      border-radius: 8px;
      padding: 8px 14px;
      cursor: pointer;
    }
    main {
      width: min(920px, calc(100vw - 32px));
      margin: 0 auto 40px;
      background: #ffffff;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
    }
    header {
      padding: 34px 42px 28px;
      background: #0f172a;
      color: #ffffff;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 32px;
      line-height: 1.2;
    }
    .target {
      margin: 0 0 14px;
      color: #cbd5e1;
      font-size: 17px;
    }
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      color: #e5e7eb;
      font-size: 14px;
    }
    .content {
      padding: 30px 42px 40px;
    }
    section.block {
      margin-bottom: 26px;
    }
    h2 {
      margin: 0 0 14px;
      padding-bottom: 8px;
      border-bottom: 2px solid #dbeafe;
      color: #1e3a8a;
      font-size: 18px;
    }
    h3 {
      margin: 10px 0 6px;
      color: #334155;
      font-size: 15px;
    }
    p {
      margin: 0;
    }
    .muted {
      color: #64748b;
      margin-top: 4px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    li {
      margin: 4px 0;
    }
    .item {
      margin-bottom: 16px;
    }
    .item-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      color: #0f172a;
    }
    .item-head span {
      flex: 0 0 auto;
      color: #64748b;
    }
    @media print {
      body { background: #ffffff; }
      main { width: 100%; margin: 0; box-shadow: none; }
      .resume-print-toolbar { display: none !important; }
    }
    @page { margin: 0; }
  </style>
</head>
<body>
  <div class="resume-print-toolbar">
    <button onclick="window.print()">打印简历</button>
  </div>
  <main>
    <header>
      <h1>${escapeHtml(input.basic.name)}</h1>
      <p class="target">应聘岗位：${escapeHtml(input.basic.target_position)}</p>
      <div class="contact">
        <span>${escapeHtml(input.basic.phone)}</span>
        <span>${escapeHtml(input.basic.email)}</span>
        ${targetCity ? `<span>意向城市：${escapeHtml(targetCity)}</span>` : ""}
      </div>
    </header>
    <div class="content">
      <section class="block">
        <h2>个人优势</h2>
        <p>${escapeHtml(summary)}</p>
      </section>
      <section class="block">
        <h2>教育背景</h2>
        ${educations}
      </section>
      <section class="block">
        <h2>项目 / 实习经历</h2>
        ${experiences}
      </section>
      <section class="block">
        <h2>专业技能</h2>
        <ul>${buildHtmlList(skills)}</ul>
      </section>
      ${certificatesBlock}
      ${awardsBlock}
      ${portfolioBlock}
    </div>
  </main>
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
    "请直接根据下面的结构化信息生成学生求职简历，不要再提问。",
    "输出要求：仅返回一份完整 HTML（放在 ```html 代码块），可直接在浏览器新标签页打开并打印。",
    "可靠性要求：只基于字段事实润色。没有提供的数据不要补写；如果成果没有数字，不要虚构百分比、金额、排名或用户量。",
    "内容结构建议：基本信息、个人优势、教育背景、专业技能、项目/实习经历、证书、奖项/竞赛、作品链接。",
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
    if (error instanceof HttpError && error.code === "AI_RESUME_HTML_TIMEOUT") {
      const fallbackHtml = buildLocalResumeHtml(options.input);
      console.warn(
        `[ai-resume] fallback trace_id=${options.traceId} reason=timeout duration_ms=${
          Date.now() - startedAt
        }`,
      );

      return {
        trace_id: options.traceId,
        model: session.model ? `${session.model.provider}/${session.model.id}` : selectedModelLabel,
        html: fallbackHtml,
        generated_at: new Date().toISOString(),
      };
    }

    console.error(
      `[ai-resume] fail trace_id=${options.traceId} duration_ms=${Date.now() - startedAt} message=${message}`,
    );
    throw error;
  } finally {
    unsubscribe();
    session.dispose();
  }
}
