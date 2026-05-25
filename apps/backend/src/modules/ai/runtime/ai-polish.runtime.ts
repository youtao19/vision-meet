/**
 * 文件作用：封装报告章节 AI 润色运行时。
 * 职责边界：本文件只负责调用独立 Agent 完成文本润色，并在返回前清理模型说明性外壳；
 * 报告保存、导出与页面展示由 report/frontend 模块负责。
 */
import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { HttpError } from "../../../shared/errors/http-error.js";
import { resolvePiRuntimeModelRef } from "../../../shared/agent/pi-runtime-config.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
} from "./ai-agent.utils.js";
import type { CreateAiPolishRequest, AiPolishResponse } from "@career/contracts/types";

export type RunPolishAgentOptions = {
  input: CreateAiPolishRequest;
  traceId: string;
  model?: string;
  piAgentDir?: string;
  sessionStoreDir?: string;
  cwd?: string;
};

const POLISH_SYSTEM_PROMPT = `# 角色
你是职业规划报告的文本润色助手。

# 任务
对输入文本进行润色，在不改变原意的前提下，提高表达的专业性、逻辑性与连贯性。

# 规则（必须严格遵守）
1. 仅输出润色后的正文内容。
2. 不得输出任何解释、说明、前后缀、提示语或对话内容。
3. 不得新增信息、扩展观点或改变原有结论。
4. 保持原有结构，可适度优化句式与段落衔接。
5. 语言风格：简洁、专业、客观，避免口语化。
6. 可使用 Markdown（如加粗、分段），但仅用于提升正文可读性。
7. 禁止出现如下内容：
   - “润色后如下”“以下是结果”“说明”“解释”等提示语
   - 任何与正文无关的内容
   - 追问、建议或额外补充

# 输出要求
直接输出最终文本，无任何额外内容。
`;

function stripWrappingMarkdownFence(input: string): string {
  const matched = input.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/iu);
  return matched ? matched[1].trim() : input;
}

function normalizePreambleLine(input: string): string {
  return input
    .trim()
    .replace(/^>\s*/u, "")
    .replace(/^#{1,6}\s*/u, "")
    .trim();
}

function isPolishPreambleLine(input: string): boolean {
  const line = normalizePreambleLine(input);
  if (!line) {
    return true;
  }

  return (
    /^[-*_]{3,}$/u.test(line) ||
    /^无需调用任何工具[，,、\s]*(?:我)?(?:将|可|可以|直接)?(?:为您|为你|帮您|帮你)?(?:润色|优化)[^：:。]*[：:]?$/u.test(
      line,
    ) ||
    /^以下(?:是|为)?(?:我(?:为你|帮你)?(?:润色|优化)(?:后)?的?)?(?:润色|优化)(?:后)?(?:的)?(?:文本|内容|结果)(?:如下|如下所示)?[：:]?$/u.test(
      line,
    ) ||
    /^(?:润色|优化)(?:后)?(?:的)?(?:文本|内容|结果)(?:如下|如下所示)?[：:]?$/u.test(line) ||
    /^我(?:来|将|会|已经|已)(?:为你|帮你)?(?:对这段|将这段|把这段|这段|该段|以下)?[^。\n]*?(?:润色|优化)[^。\n]*[：:]$/u.test(
      line,
    ) ||
    /^已(?:经)?(?:为你|帮你)?(?:完成)?[^。\n]*?(?:润色|优化)[^。\n]*[：:]?$/u.test(line)
  );
}

function stripLeadingPolishPreamble(input: string): string {
  const lines = input.split("\n");

  while (lines.length > 0 && isPolishPreambleLine(lines[0] ?? "")) {
    lines.shift();
  }

  return lines.join("\n").trim();
}

function stripTrailingPolishMeta(input: string): string {
  const lines = input.split("\n");

  while (lines.length > 0) {
    const line = normalizePreambleLine(lines[lines.length - 1] ?? "");
    if (
      /^[-*_]{3,}$/u.test(line) ||
      /^如需.*(?:调整|修改|补充|优化|风格|岗位方向).*?(?:告诉我|继续|再说|提出)[。.!！]?$/u.test(
        line,
      ) ||
      /^如果(?:你)?(?:还)?需要.*?(?:我可以|可以继续|请告诉我|告诉我)[。.!！]?$/u.test(line) ||
      /^需要(?:更正式|更活泼|进一步|继续).*?(?:告诉我|可以继续|请告诉我)[。.!！]?$/u.test(line)
    ) {
      lines.pop();
      continue;
    }

    break;
  }

  return lines.join("\n").trim();
}

/**
 * 作用：清理模型在润色正文前额外输出的说明性前缀。
 * 参数：rawText 为 Agent 原始输出，fallbackContent 为原始正文兜底。
 * 返回：可直接写回报告章节的正文内容。
 * 注意：允许保留正文 Markdown，只处理模型输出外壳，避免改写正文业务含义。
 */
export function sanitizePolishedText(
  rawText: string,
  fallbackContent: string,
  _sectionTitle?: string,
): string {
  let cleaned = rawText.replace(/\r\n/g, "\n").trim();

  // 模型有时会先写说明，再把正文包进 Markdown 代码块；循环处理可覆盖多种嵌套顺序。
  for (let index = 0; index < 3; index += 1) {
    const previous = cleaned;
    cleaned = stripWrappingMarkdownFence(cleaned);
    cleaned = stripLeadingPolishPreamble(cleaned);
    cleaned = stripTrailingPolishMeta(cleaned);

    if (cleaned === previous) {
      break;
    }
  }

  return cleaned || fallbackContent.trim();
}

export async function runPolishAgent(options: RunPolishAgentOptions): Promise<AiPolishResponse> {
  const piAgentDir = options.piAgentDir || resolveDefaultPiAgentDir();
  const sessionStoreDir =
    options.sessionStoreDir || path.join(piAgentDir, "sessions", "polish-runtime");
  const taskSessionDir = path.join(sessionStoreDir, options.traceId);

  ensureDirectory(piAgentDir);
  ensureCompatibleAgentBootstrap(piAgentDir);
  ensureDirectory(taskSessionDir);

  const authStorage = AuthStorage.create(path.join(piAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(piAgentDir, "models.json"));
  const modelRef = resolvePiRuntimeModelRef(piAgentDir, options.model);
  const selectedModel = modelRef
    ? modelRegistry.find(modelRef.provider, modelRef.modelId)
    : undefined;

  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: piAgentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => POLISH_SYSTEM_PROMPT,
  });

  const cwd = options.cwd || process.cwd();
  const { session, modelFallbackMessage } = await createAgentSession({
    cwd,
    agentDir: piAgentDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel: "off",
    sessionManager: SessionManager.create(cwd, taskSessionDir),
    resourceLoader,
    tools: [], // No tools needed
  });

  if (!session.model) {
    session.dispose();
    throw new HttpError(
      500,
      "AGENT_MODEL_UNAVAILABLE",
      modelFallbackMessage || "当前独立 Agent 配置目录下没有可用模型",
    );
  }

  const assistantMessages: string[] = [];
  const unsubscribe = session.subscribe((ev) => {
    if (
      ev.type === "message_update" &&
      (ev.message as { role?: unknown }).role === "assistant" &&
      ev.assistantMessageEvent.type === "text_delta"
    ) {
      assistantMessages.push(ev.assistantMessageEvent.delta);
    }
  });

  try {
    let userInput = `请润色如下文本：\n${options.input.content}`;
    if (options.input.section_title) {
      userInput = `背景（本章节标题）：${options.input.section_title}\n\n${userInput}`;
    }

    await session.prompt(userInput);

    let polishedText = sanitizePolishedText(
      assistantMessages.join(""),
      options.input.content,
      options.input.section_title,
    );
    if (!polishedText) {
      polishedText = options.input.content; // fallback
    }

    return {
      polished_content: polishedText,
    };
  } finally {
    unsubscribe();
    session.dispose();
  }
}
