import { z } from "zod";

import { HttpError } from "../../../shared/errors/http-error.js";
import { resumeHtmlCreateSchema } from "../../resume/resume.schemas.js";

const resumeDraftOutputSchema = z.object({
  status: z.enum(["collecting", "draft_ready"]),
  assistant_message: z.string().trim().min(1).max(4000),
  draft_text: z.string().trim().min(1).max(12000).optional(),
  resume_payload: resumeHtmlCreateSchema.optional(),
});

type ResumeDraftOutputCandidate = {
  status?: unknown;
  assistant_message?: unknown;
  draft_text?: unknown;
  resume_payload?: unknown;
};

type UnknownRecord = Record<string, unknown>;

function extractJsonObject(rawText: string): unknown {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? rawText;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new HttpError(502, "AI_RESUME_DRAFT_OUTPUT_INVALID", "模型未返回简历确认稿 JSON");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 解析失败";
    throw new HttpError(
      502,
      "AI_RESUME_DRAFT_OUTPUT_INVALID",
      `简历确认稿 JSON 解析失败：${message}`,
    );
  }
}

function isBlankString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length === 0;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const text = value
      .map((item) => compactText(item))
      .filter((item): item is string => Boolean(item))
      .join("；");
    return text || undefined;
  }
  if (isRecord(value)) {
    const text = Object.values(value)
      .map((item) => compactText(item))
      .filter((item): item is string => Boolean(item))
      .join("；");
    return text || undefined;
  }
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function normalizeExperienceType(value: unknown): unknown {
  const text = compactText(value);
  if (!text) return undefined;
  const normalized = text.toLowerCase();
  if (["project", "项目", "项目经历", "课程项目", "个人项目"].includes(normalized))
    return "project";
  if (["internship", "实习", "实习经历", "工作经历"].includes(normalized)) return "internship";
  if (["competition", "竞赛", "比赛", "竞赛经历", "比赛经历"].includes(normalized)) {
    return "competition";
  }
  if (["campus", "校园", "校园经历", "社团经历", "学生工作"].includes(normalized)) return "campus";
  return value;
}

function pickText(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = compactText(record[key]);
    if (value) return value;
  }
  return undefined;
}

function normalizeResumePayload(value: unknown, draftText?: string): unknown {
  if (!isRecord(value)) return value;

  const payload: UnknownRecord = { ...value };
  const basic = isRecord(payload.basic) ? { ...payload.basic } : {};
  const educations = Array.isArray(payload.educations) ? payload.educations : [];
  const experiences = Array.isArray(payload.experiences) ? payload.experiences : [];

  payload.basic = {
    name: compactText(basic.name),
    phone: compactText(basic.phone),
    email: compactText(basic.email),
    target_position: compactText(basic.target_position),
    target_city: compactText(basic.target_city),
  };

  payload.educations = educations.map((item) => {
    if (!isRecord(item)) return item;
    return {
      school: compactText(item.school),
      major: compactText(item.major),
      degree: compactText(item.degree),
      period: compactText(item.period),
      gpa: compactText(item.gpa),
      core_courses: compactText(item.core_courses),
      honors: compactText(item.honors),
    };
  });

  payload.experiences = experiences.map((item) => {
    if (!isRecord(item)) return item;
    const responsibilities =
      pickText(item, ["responsibilities", "responsibility", "duties", "tasks", "contributions"]) ||
      "详见确认稿中的经历描述";
    const achievements =
      pickText(item, ["achievements", "achievement", "outcomes", "results", "outputs"]) ||
      "详见确认稿中的经历成果";
    return {
      organization:
        pickText(item, ["organization", "name", "project_name", "company", "activity_name"]) ||
        "未命名经历",
      role: pickText(item, ["role", "title", "position", "job_title"]) || "参与者",
      period: pickText(item, ["period", "time", "date", "duration"]) || "时间未明确",
      type: normalizeExperienceType(item.type),
      background: compactText(item.background),
      tech_stack: compactText(item.tech_stack),
      responsibilities,
      achievements,
      difficulties: compactText(item.difficulties),
    };
  });

  payload.summary = compactText(payload.summary);
  payload.skills = compactText(payload.skills) || "详见确认稿中的专业技能";
  payload.certificates = compactText(payload.certificates);
  payload.awards = compactText(payload.awards);
  payload.portfolio_links = compactText(payload.portfolio_links);
  payload.confirmed_draft = compactText(payload.confirmed_draft) || draftText;

  return payload;
}

function normalizeDraftOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const candidate = { ...(value as ResumeDraftOutputCandidate) };
  if (isBlankString(candidate.assistant_message)) {
    candidate.assistant_message =
      candidate.status === "draft_ready"
        ? "文字版确认稿已生成，请检查内容后确认。"
        : "请继续补充项目、实习、竞赛、校园经历或专业技能信息。";
  }

  if (isBlankString(candidate.draft_text)) {
    delete candidate.draft_text;
  }

  if (candidate.status !== "draft_ready") {
    delete candidate.draft_text;
    delete candidate.resume_payload;
  } else if (candidate.resume_payload) {
    candidate.resume_payload = normalizeResumePayload(
      candidate.resume_payload,
      compactText(candidate.draft_text),
    );
  }

  return candidate;
}

export function parseResumeDraftAgentOutput(rawText: string) {
  const parsed = resumeDraftOutputSchema.safeParse(
    normalizeDraftOutput(extractJsonObject(rawText)),
  );
  if (!parsed.success) {
    throw new HttpError(502, "AI_RESUME_DRAFT_OUTPUT_INVALID", "简历确认稿输出结构不合法", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (parsed.data.status === "draft_ready") {
    if (!parsed.data.draft_text || !parsed.data.resume_payload) {
      throw new HttpError(
        502,
        "AI_RESUME_DRAFT_OUTPUT_INVALID",
        "确认稿已就绪时必须同时返回 draft_text 和 resume_payload",
      );
    }
    return {
      ...parsed.data,
      resume_payload: {
        ...parsed.data.resume_payload,
        confirmed_draft: parsed.data.draft_text,
      },
    };
  }

  return {
    status: parsed.data.status,
    assistant_message: parsed.data.assistant_message,
  };
}
