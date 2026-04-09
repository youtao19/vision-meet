/**
 * 文件作用：通过 Pi Agent 的多模态输入能力解析图片型简历或扫描版 PDF。
 * 职责边界：这里只负责“图片/PDF -> 结构化视觉提取结果”，不直接生成学生画像；
 * 最终画像仍由 profile.service 基于提取出的文本与姓名做统一业务归一。
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  ensureCompatibleAgentBootstrap,
  ensureDirectory,
  resolveDefaultPiAgentDir,
} from "../ai/runtime/ai-agent.utils.js";

const execFileAsync = promisify(execFile);

export type ResumeVisionResult = {
  name: string | null;
  targetRole: string | null;
  plainText: string;
  model: string | null;
  traceId: string;
};

export type ResumeVisionParser = (params: {
  fileName: string;
  buffer: Buffer;
}) => Promise<ResumeVisionResult>;

function normalizePlainText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getImageMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

function extractJsonObjectFromAgentText(rawText: string): string | null {
  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const genericFencedMatch = rawText.match(/```[\w-]*\s*([\s\S]*?)```/);
  if (genericFencedMatch?.[1]?.trim().startsWith("{")) {
    return genericFencedMatch[1].trim();
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1).trim();
  }

  return null;
}

/**
 * 把视觉模型返回的结构化结果归一成后续画像服务可消费的文本。
 * 注意点：除了转写正文，还会显式补回“姓名/求职意向”标签，便于沿用现有的文本抽取规则。
 */
function buildVisionResumePlainText(input: {
  name: string | null;
  targetRole: string | null;
  plainText: string;
}): string {
  const lines = [
    input.name ? `姓名：${input.name}` : "",
    input.targetRole ? `求职意向：${input.targetRole}` : "",
    input.plainText,
  ]
    .filter(Boolean)
    .join("\n");

  return normalizePlainText(lines);
}

async function convertPdfFirstPageToPng(buffer: Buffer): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "career-agent-resume-vision-"));
  const inputPath = path.join(tempDir, "resume.pdf");
  const outputPrefix = path.join(tempDir, "resume-page");
  const outputPath = `${outputPrefix}.png`;

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("pdftoppm", ["-f", "1", "-singlefile", "-png", inputPath, outputPrefix]);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function summarizeAssistantMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }

      if (!item || typeof item !== "object") {
        return [];
      }

      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n")
    .trim();
}

function parseResumeVisionResult(rawText: string): { name: string | null; targetRole: string | null; plainText: string } {
  const jsonText = extractJsonObjectFromAgentText(rawText);
  if (!jsonText) {
    throw new Error("RESUME_VISION_JSON_NOT_FOUND");
  }

  const parsed = JSON.parse(jsonText) as {
    name?: unknown;
    target_role?: unknown;
    plain_text?: unknown;
  };

  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null;
  const targetRole =
    typeof parsed.target_role === "string" && parsed.target_role.trim()
      ? parsed.target_role.trim()
      : null;
  const plainText =
    typeof parsed.plain_text === "string" ? normalizePlainText(parsed.plain_text) : "";

  if (!plainText && !name) {
    throw new Error("RESUME_VISION_EMPTY_RESULT");
  }

  return {
    name,
    targetRole,
    plainText,
  };
}

/**
 * 作用：创建基于 Pi Agent 的简历视觉解析器。
 * 参数：
 * - env: 应用环境配置，用于读取 Agent 模型、目录和超时参数。
 * - cwd: 当前工作目录，供 Pi Session 与资源加载器使用。
 * 返回：可直接对图片或 PDF 执行视觉解析的函数。
 * 注意点：若当前 AGENT_MODEL 不支持 image 输入，会直接抛错，避免把图片错误发送给纯文本模型。
 */
export function createResumeVisionParser(params: {
  env: AppEnv;
  cwd: string;
}): ResumeVisionParser {
  return async function parseResumeByVision(input): Promise<ResumeVisionResult> {
    const traceId = randomUUID();
    const piAgentDir = params.env.AGENT_PI_DIR || resolveDefaultPiAgentDir();
    const sessionStoreDir = params.env.AGENT_SESSION_STORE_DIR;
    const taskSessionDir = `${sessionStoreDir}/resume-vision-runtime/${traceId}`;

    ensureDirectory(piAgentDir);
    ensureCompatibleAgentBootstrap(piAgentDir);
    ensureDirectory(taskSessionDir);

    const authStorage = AuthStorage.create(`${piAgentDir}/auth.json`);
    const modelRegistry = ModelRegistry.create(authStorage, `${piAgentDir}/models.json`);
    const modelRef = params.env.AGENT_MODEL?.trim();
    if (!modelRef) {
      throw new HttpError(500, "AGENT_MODEL_REQUIRED", "图片简历解析需要配置 AGENT_MODEL");
    }

    const slashIndex = modelRef.indexOf("/");
    if (slashIndex <= 0 || slashIndex === modelRef.length - 1) {
      throw new HttpError(
        500,
        "AGENT_MODEL_INVALID",
        "AGENT_MODEL 必须采用 provider/model 格式，例如 kimi-coding/k2p5",
      );
    }

    const selectedModel = modelRegistry.find(
      modelRef.slice(0, slashIndex),
      modelRef.slice(slashIndex + 1),
    );
    if (!selectedModel) {
      throw new HttpError(500, "AGENT_MODEL_NOT_FOUND", `未找到模型 ${modelRef}`);
    }

    const supportedInputs = Array.isArray((selectedModel as { input?: unknown }).input)
      ? ((selectedModel as { input?: string[] }).input ?? [])
      : [];
    if (!supportedInputs.includes("image")) {
      throw new HttpError(
        422,
        "AGENT_MODEL_IMAGE_UNSUPPORTED",
        `当前模型 ${modelRef} 未声明 image 输入能力，无法直接解析图片简历`,
      );
    }

    const imageBuffer = input.fileName.toLowerCase().endsWith(".pdf")
      ? await convertPdfFirstPageToPng(input.buffer)
      : input.buffer;
    const imageMimeType = input.fileName.toLowerCase().endsWith(".pdf")
      ? "image/png"
      : getImageMimeType(input.fileName);

    const resourceLoader = new DefaultResourceLoader({
      cwd: params.cwd,
      agentDir: piAgentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      systemPromptOverride: () =>
        [
          "你是简历视觉解析助手。",
          "你只能根据图片中实际可见内容提取信息，禁止猜测或补写不存在的内容。",
          "你必须只输出 JSON 对象，不要输出 Markdown、解释或额外文本。",
          'JSON 字段固定为：name, target_role, plain_text。',
          "name 与 target_role 在无法确认时返回 null。",
          "plain_text 必须是尽量完整的纯文本转写，保留换行，优先包含姓名、联系方式、教育经历、项目经历、技能与求职意向。",
        ].join("\n"),
    });
    await resourceLoader.reload();

    const { session, modelFallbackMessage } = await createAgentSession({
      cwd: params.cwd,
      agentDir: piAgentDir,
      authStorage,
      modelRegistry,
      model: selectedModel,
      thinkingLevel: params.env.AGENT_THINKING_LEVEL,
      sessionManager: SessionManager.create(params.cwd, taskSessionDir),
      resourceLoader,
      tools: [],
      customTools: [],
    });

    if (!session.model) {
      session.dispose();
      throw new HttpError(
        500,
        "AGENT_MODEL_UNAVAILABLE",
        modelFallbackMessage || "当前 Agent 会话未找到可用多模态模型",
      );
    }

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
          lastTurnError = String(assistantMessage.errorMessage || "简历视觉解析失败");
        }
      }
    });

    try {
      const prompt = [
        "请读取这张简历图片，并提取结构化结果。",
        "输出要求：只返回 JSON 对象，禁止额外解释。",
        "如果图中姓名清晰可见，请放入 name；如果求职岗位/意向清晰可见，请放入 target_role。",
        "plain_text 请尽量完整转写图片里的简历文本，按自然换行组织。",
      ].join("\n");

      await Promise.race([
        session.prompt(prompt, {
          images: [
            {
              type: "image",
              data: imageBuffer.toString("base64"),
              mimeType: imageMimeType,
            },
          ],
        }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error(`AGENT_TIMEOUT:${params.env.AGENT_RESUME_TIMEOUT_MS}`));
          }, params.env.AGENT_RESUME_TIMEOUT_MS);
        }),
      ]);

      if (lastTurnError) {
        throw new Error(lastTurnError);
      }

      const rawText = assistantMessages.at(-1)?.trim() || streamingAssistantBuffer.trim();
      if (!rawText) {
        throw new Error("RESUME_VISION_NO_OUTPUT");
      }

      const parsed = parseResumeVisionResult(rawText);
      return {
        name: parsed.name,
        targetRole: parsed.targetRole,
        plainText: buildVisionResumePlainText(parsed),
        model: session.model ? `${session.model.provider}/${session.model.id}` : null,
        traceId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new HttpError(
        422,
        "RESUME_VISION_FAILED",
        `图片简历解析失败：${message}`,
      );
    } finally {
      unsubscribe();
      session.dispose();
    }
  };
}
